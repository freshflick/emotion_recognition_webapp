"""
Server-side Supabase client, using the SERVICE ROLE key (never expose this to
the browser). FastAPI is the only thing allowed to write final results —
this keeps report integrity out of the client's hands.
"""
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from uuid import UUID

from supabase import Client, create_client

from config import SUPABASE_ENABLED, SUPABASE_SECRET_KEY, SUPABASE_URL

_client: Client | None = None


def is_enabled() -> bool:
    """
    False when no Supabase credentials are configured. The API still serves
    predictions in that state — it just can't persist or list them, so every
    write below no-ops and reads come back empty rather than crashing. This
    keeps the app usable for local development before the project is set up.
    """
    return SUPABASE_ENABLED


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    return _client


def save_session_report(user_id: str, report: dict) -> dict:
    """
    Insert a completed session's fused emotion report.
    Expected `emotion_reports` table columns:
        id (uuid, pk, default gen_random_uuid())
        user_id (uuid, fk -> auth.users)
        created_at (timestamptz, default now())
        data (jsonb)
    """
    if not is_enabled():
        return {}

    client = get_client()
    result = (
        client.table("emotion_reports")
        .insert(
            {
                "user_id": user_id,
                "data": report,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}


def upload_audio_file(
    user_id: str,
    filename: str,
    file_bytes: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Uploads raw audio to a Supabase Storage bucket named 'audio-uploads'.
    Returns the storage path, or "" when persistence is disabled.
    Create the bucket in the Supabase dashboard first.
    """
    if not is_enabled():
        return ""

    client = get_client()
    safe_filename = Path(filename or "upload.bin").name
    path = f"{user_id}/{datetime.now(timezone.utc).timestamp()}_{safe_filename}"
    client.storage.from_("audio-uploads").upload(
        path, file_bytes, {"content-type": content_type}
    )
    return path


def get_user_reports(user_id: str, batch_size: int = 1000) -> list[dict]:
    if not is_enabled():
        return []

    client = get_client()
    reports: list[dict] = []
    start = 0
    while True:
        result = (
            client.table("emotion_reports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(start, start + batch_size - 1)
            .execute()
        )
        batch = result.data or []
        reports.extend(batch)
        if len(batch) < batch_size:
            return reports
        start += batch_size


def delete_user_reports(user_id: str, report_ids: list[str]) -> int:
    """
    Delete owned reports and their uploaded audio objects from Supabase Storage.

    Audio objects are removed before database rows. If Storage deletion fails,
    the report rows remain so the caller can retry instead of leaving orphaned
    files with no report path. Returns the number of rows deleted.
    """
    if not is_enabled() or not report_ids:
        return 0

    # UUID columns reject local-only frontend IDs. Filter them before querying
    # so a mixed selection of server and local sessions still deletes safely.
    valid_ids = []
    for report_id in report_ids:
        try:
            valid_ids.append(str(UUID(report_id)))
        except (ValueError, TypeError, AttributeError):
            continue
    if not valid_ids:
        return 0

    client = get_client()
    selected = (
        client.table("emotion_reports")
        .select("id,data")
        .eq("user_id", user_id)
        .in_("id", valid_ids)
        .execute()
    )
    owned_rows = selected.data or []
    if not owned_rows:
        return 0

    # Only remove paths created under this user's own storage prefix. This
    # avoids trusting arbitrary JSON paths in the report row.
    user_prefix = PurePosixPath(user_id)
    audio_paths = []
    for row in owned_rows:
        report_data = row.get("data")
        path = report_data.get("audio_path") if isinstance(report_data, dict) else None
        if not isinstance(path, str) or not path:
            continue
        object_path = PurePosixPath(path)
        if (
            not object_path.is_absolute()
            and object_path.parts
            and object_path.parts[0] == user_prefix.name
            and ".." not in object_path.parts
        ):
            audio_paths.append(str(object_path))

    if audio_paths:
        client.storage.from_("audio-uploads").remove(audio_paths)

    owned_ids = [row["id"] for row in owned_rows if row.get("id")]
    if not owned_ids:
        return 0
    result = (
        client.table("emotion_reports")
        .delete()
        .eq("user_id", user_id)
        .in_("id", owned_ids)
        .execute()
    )
    return len(result.data or [])

"""
Server-side Supabase client, using the SERVICE ROLE key (never expose this to
the browser). FastAPI is the only thing allowed to write final results —
this keeps report integrity out of the client's hands.
"""
from datetime import datetime, timezone
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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


def upload_audio_file(user_id: str, filename: str, file_bytes: bytes) -> str:
    """
    Uploads raw audio to a Supabase Storage bucket named 'audio-uploads'.
    Returns the storage path. Create the bucket in the Supabase dashboard first.
    """
    client = get_client()
    path = f"{user_id}/{datetime.now(timezone.utc).timestamp()}_{filename}"
    client.storage.from_("audio-uploads").upload(
        path, file_bytes, {"content-type": "audio/wav"}
    )
    return path


def get_user_reports(user_id: str, limit: int = 50) -> list[dict]:
    client = get_client()
    result = (
        client.table("emotion_reports")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data

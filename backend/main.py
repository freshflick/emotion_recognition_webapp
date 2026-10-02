import os
import random
import time
from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import storage
from auth import get_current_user
from config import (
    ALLOWED_ORIGINS,
    DEVICE,
    DISABLE_AUTH,
    FUSION_MODEL_CHECKPOINT,
    UPLOAD_WINDOW_SECONDS,
    USE_MOCK_MODEL,
)
from models import audio_utils, emotion_model, stt
from models.speaker_diarization import OnlineSpeakerDiarizer
from storage import get_user_reports, save_session_report, upload_audio_file
from websocket_handler import handle_audio_session, run_blocking

# Uploads larger than this are rejected before being read into memory.
# Mirrors the "Max 50 MB" the upload UI advertises.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_SUBJECT_SAMPLE_BYTES = 10 * 1024 * 1024

# Used only when the upstream quotes API is unreachable — kept short and
# generic rather than duplicating the frontend's full quote list, since
# this only fires in a rare "everything is degraded" case.
FALLBACK_QUOTES = [
    {"text": "Take a moment to reflect on how you're feeling.", "author": "Emphona"},
    {"text": "Understanding your emotions is the first step to understanding yourself.", "author": "Emphona"},
]

# --- Quote of the day ---
# Fetched server-side (not from the browser) specifically to sidestep the
# upstream API's inconsistent CORS support — some clients report it working,
# some report it blocked, depending on origin. Calling it from the backend
# avoids that question entirely. Cached once per calendar day and shared
# across every signed-in user, so a busy dashboard doesn't turn into one
# outbound request per page load.
QUOTE_API_URL = "https://zenquotes.io/api/random"

_quote_cache: dict = {"quote": None, "date": None}


def _normalise_quote(value: dict | None) -> dict:
    fallback = random.choice(FALLBACK_QUOTES)
    if not isinstance(value, dict):
        return fallback
    text = value.get("text") or value.get("q")
    author = value.get("author") or value.get("a")
    if not isinstance(text, str) or not text.strip() or not isinstance(author, str) or not author.strip():
        return fallback
    return {"text": text.strip(), "author": author.strip()}

async def _fetch_quote_from_api() -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(QUOTE_API_URL)
        resp.raise_for_status()
        data = resp.json()
        # ZenQuotes wraps a single result in a one-item array: [{"q": ..., "a": ...}]
        return _normalise_quote(data[0] if data else None)
    return None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Loads Whisper + the trained fusion checkpoint once, at process startup."""
    checkpoint_exists = os.path.exists(FUSION_MODEL_CHECKPOINT)

    if USE_MOCK_MODEL:
        emotion_model.enable_mock_mode()
        stt.enable_mock_mode()
        print(
            "\n[startup] *** MOCK MODE (USE_MOCK_MODEL=true) ***\n"
            "           Predictions and transcripts are randomised placeholders.\n"
            "           Responses are tagged \"mock\": true and the UI badges them.\n"
            "           Place the trained fusion checkpoint at "
            f"{FUSION_MODEL_CHECKPOINT} and set USE_MOCK_MODEL=false\n"
            "           to serve real results.\n"
        )
    elif not checkpoint_exists:
        raise RuntimeError(
            f"Fusion checkpoint not found at {FUSION_MODEL_CHECKPOINT}. "
            "Set FUSION_MODEL_CHECKPOINT to the real checkpoint or explicitly "
            "set USE_MOCK_MODEL=true for development."
        )
    else:
        stt.load_model()
        emotion_model.load_model(FUSION_MODEL_CHECKPOINT, device=DEVICE)
        print(f"[startup] fusion model loaded from {FUSION_MODEL_CHECKPOINT}")

    if DISABLE_AUTH and os.getenv("ENV", "development") == "production":
        raise RuntimeError("DISABLE_AUTH=true is not allowed when ENV=production")

    if not storage.is_enabled():
        print(
            "[startup] Supabase not configured — predictions work, but reports "
            "will not be saved or listed."
        )

    yield


app = FastAPI(title="Emotion Monitoring API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """
    The frontend polls this to drive the model status indicators, so it
    reports exactly which subsystems are live rather than just "ok".
    """
    return {
        "status": "ok",
        "model_loaded": emotion_model.is_loaded(),
        "mock_mode": emotion_model.is_mock(),
        "auth_disabled": DISABLE_AUTH,
        "persistence_enabled": storage.is_enabled(),
        "labels": emotion_model.LABEL_NAMES,
        "audio_model": emotion_model.AUDIO_MODEL_NAME,
        "text_model": emotion_model.TEXT_MODEL_NAME,
    }


@app.get("/api/quote")
async def quote():
    """
    One quote per calendar day (server time), shared by every user, backed
    by a free public API with a local fallback if it's unreachable or rate
    limits us. Deliberately unauthenticated — it's the same for everyone on
    a given day, so there's nothing user-specific to protect.
    """
    today = time.strftime("%Y-%m-%d")
    if _quote_cache["date"] != today or _quote_cache["quote"] is None:
        try:
            _quote_cache["quote"] = await _fetch_quote_from_api()
        except Exception as e:
            print(f"[warn] quote API unreachable, using fallback: {e}")
            _quote_cache["quote"] = random.choice(FALLBACK_QUOTES)
        _quote_cache["date"] = today

    return _quote_cache["quote"]

@app.post("/api/analyze-file")
async def analyze_file(
    file: UploadFile,
    subject_sample: UploadFile | None = File(None),
    subject_name: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """
    Non-live path: upload a full audio file, get a timeline of emotion results.

    The model takes a fixed 8-second input, so anything longer is split into
    consecutive windows and each is predicted separately — otherwise a long
    recording would be truncated to its first 8 seconds and reported as if it
    described the whole file. `emotion` carries the highest-confidence window
    so callers wanting a single headline result still have one.

    When `subject_sample` is supplied (a short recording of the one person the
    user cares about), every window is matched against that voice profile and
    only the subject's windows are given an emotion. All windows still produce a
    transcript, so the conversation stays complete. Without a sample the file is
    treated as a single speaker, which keeps older clients working.
    """
    raw_bytes = await file.read(MAX_UPLOAD_BYTES + 1)

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit",
        )

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() or "wav"

    try:
        wav_bytes = await run_blocking(audio_utils.to_wav_pcm16, raw_bytes, ext)
        waveform = await run_blocking(audio_utils.bytes_to_full_waveform, wav_bytes)
    except Exception as e:
        # Almost always an unreadable/unsupported file, or ffmpeg missing.
        raise HTTPException(
            status_code=400, detail=f"Could not decode audio ({ext}): {e}"
        )

    # Enrol the subject's voice so each window can be attributed to them.
    diarizer = None
    if subject_sample is not None:
        sample_bytes = await subject_sample.read(MAX_SUBJECT_SAMPLE_BYTES + 1)
        if len(sample_bytes) > MAX_SUBJECT_SAMPLE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Subject sample exceeds the "
                    f"{MAX_SUBJECT_SAMPLE_BYTES // (1024 * 1024)}MB limit"
                ),
            )
        if sample_bytes:
            # The browser's MediaRecorder emits WebM/Opus, so the declared
            # extension has to be honoured — decoding it as "wav" makes ffmpeg
            # fail on every real recording from the UI.
            sample_ext = Path(subject_sample.filename or "").suffix.lstrip(".").lower()
            if not sample_ext:
                sample_ext = (subject_sample.content_type or "").rsplit("/", 1)[-1]
                # A codec parameter is not a container (e.g. "webm;codecs=opus").
                sample_ext = sample_ext.split(";")[0]
            sample_ext = sample_ext or "webm"
            try:
                subject_wave = await run_blocking(
                    audio_utils.bytes_to_full_waveform,
                    await run_blocking(audio_utils.to_wav_pcm16, sample_bytes, sample_ext),
                )
            except Exception as e:
                raise HTTPException(
                    status_code=400, detail=f"Could not decode the subject sample ({e})"
                )
            try:
                diarizer = OnlineSpeakerDiarizer(1, force_enrollment=True)
                await run_blocking(diarizer.prepare)
                await run_blocking(diarizer.enroll, 0, subject_wave)
            except ValueError as e:
                # Enrollment is a user mistake (too short / silent), not a crash.
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                raise HTTPException(
                    status_code=503, detail=f"Speaker recognition unavailable ({e})"
                )

    # A subject sample means several people are in the file, so use shorter
    # windows (a single 8s window often straddles two speakers) and keep them
    # unpadded so the speaker embedding isn't diluted by trailing silence.
    if diarizer:
        windows = audio_utils.split_into_windows(
            waveform,
            window_samples=int(UPLOAD_WINDOW_SECONDS * audio_utils.SAMPLE_RATE),
            pad=False,
        )
    else:
        windows = audio_utils.split_into_windows(waveform)
    if not windows:
        raise HTTPException(status_code=400, detail="Audio file contains no samples")

    segments = []
    utterances = []
    for start_secs, end_secs, window in windows:
        window_wav = await run_blocking(audio_utils.waveform_to_wav_bytes, window)
        seg_transcript = await run_blocking(stt.transcribe, window_wav)

        if diarizer is None:
            is_subject = True
            similarity = None
        else:
            is_subject, similarity = await run_blocking(diarizer.is_subject, window)

        utterances.append(
            {
                "start": round(start_secs, 2),
                "end": round(end_secs, 2),
                "transcript": seg_transcript,
                "isSubject": is_subject,
                "matchScore": round(similarity, 3) if similarity is not None else None,
            }
        )

        if not is_subject:
            # Someone else's turn: transcript only, no emotion.
            continue
        if not seg_transcript.strip():
            continue

        analysed_window = audio_utils.pad_or_truncate(audio_utils.enhance_audio(window))
        seg_emotion = await run_blocking(
            emotion_model.predict, analysed_window, seg_transcript
        )
        segments.append(
            {
                "start": round(start_secs, 2),
                "end": round(end_secs, 2),
                "transcript": seg_transcript,
                "emotion": seg_emotion,
            }
        )

    full_transcript = " ".join(
        u["transcript"] for u in utterances if u["transcript"]
    ).strip()

    # Majority vote across the subject's windows only, same convention as the
    # live path's _summarise(): Counter.most_common(1) lets the first-seen label
    # win ties. Stored so the UI can show the same dominant emotion as the DB
    # instead of re-deriving it with its own tie-break.
    seg_labels = [s["emotion"]["top_label"] for s in segments]
    seg_counts = Counter(seg_labels)
    seg_total = len(segments)
    summary = {
        "dominant_label": seg_counts.most_common(1)[0][0] if seg_counts else None,
        "label_distribution": {k: v / seg_total for k, v in seg_counts.items()} if seg_total else {},
        "average_confidence": (
            sum(s["emotion"]["confidence"] for s in segments) / seg_total if seg_total else 0.0
        ),
        "utterances": len(utterances),
        "analysed_utterances": seg_total,
    }

    # A file where the subject never appears has no headline to report; saying so
    # is more useful than reporting another person's emotion as theirs.
    headline = (
        max(segments, key=lambda s: s["emotion"]["confidence"])["emotion"]
        if segments
        else None
    )

    cleaned_name = (subject_name or "").strip()[:60] or None

    result = {
        "transcript": full_transcript,
        "emotion": headline,
        "segments": segments,
        "utterances": utterances,
        "summary": summary,
        "duration_secs": round(waveform.shape[0] / audio_utils.SAMPLE_RATE, 2),
        "subject_speaker": "Speaker 1" if diarizer else None,
        "subject_name": cleaned_name,
        "speaker_count": 1,
    }

    # Persistence is best-effort: a Supabase outage shouldn't cost the user
    # the analysis they just waited for.
    report_id = None
    try:
        original_filename = Path(file.filename or "upload.wav").name
        content_type = file.content_type or "application/octet-stream"
        storage_path = upload_audio_file(
            user["sub"], original_filename, raw_bytes, content_type
        )
        saved = save_session_report(
            user["sub"],
            {
                **result,
                "type": "upload",
                "filename": original_filename,
                "audio_path": storage_path,
            },
        )
        report_id = saved.get("id")
    except Exception as e:
        print(f"[warn] failed to persist upload report: {e}")

    return {**result, "report_id": report_id}


@app.get("/api/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    return get_user_reports(user["sub"])


@app.delete("/api/reports")
async def delete_reports(body: dict, user: dict = Depends(get_current_user)):
    """
    Delete selected session reports. `body` carries {"ids": [...]}; only
    rows owned by the caller are removed. Local-only sessions (never
    persisted) simply match nothing server-side — the frontend drops them
    from its own store regardless.
    """
    ids = body.get("ids") if isinstance(body, dict) else None
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise HTTPException(status_code=400, detail="Expected JSON body {\"ids\": [...]}")
    deleted = storage.delete_user_reports(user["sub"], ids)
    return {"deleted": deleted}


@app.websocket("/ws/live-session")
async def live_session(websocket: WebSocket):
    await handle_audio_session(websocket)


# --- Serve React's production build as static files ---
# Only present after `pnpm build` has been run and dist/ copied here.
# In dev, Vite serves the frontend and proxies /api + /ws to this process
# (see vite.config.ts), so this mount is a no-op locally.
FRONTEND_BUILD_DIR = os.getenv("FRONTEND_BUILD_DIR", "frontend/build")
if os.path.isdir(FRONTEND_BUILD_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="static")

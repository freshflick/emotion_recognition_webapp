import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import storage
from auth import get_current_user
from config import (
    ALLOWED_ORIGINS,
    DEVICE,
    DISABLE_AUTH,
    FUSION_MODEL_CHECKPOINT,
    USE_MOCK_MODEL,
)
from models import audio_utils, emotion_model, stt
from storage import get_user_reports, save_session_report, upload_audio_file
from websocket_handler import handle_audio_session, run_blocking

# Uploads larger than this are rejected before being read into memory.
# Mirrors the "Max 50 MB" the upload UI advertises.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Loads Whisper + the trained fusion checkpoint once, at process startup."""
    checkpoint_exists = os.path.exists(FUSION_MODEL_CHECKPOINT)

    if USE_MOCK_MODEL or not checkpoint_exists:
        reason = (
            "USE_MOCK_MODEL=true"
            if USE_MOCK_MODEL
            else f"no checkpoint at {FUSION_MODEL_CHECKPOINT}"
        )
        emotion_model.enable_mock_mode()
        stt.enable_mock_mode()
        print(
            f"\n[startup] *** MOCK MODE ({reason}) ***\n"
            "           Predictions and transcripts are randomised placeholders.\n"
            "           Responses are tagged \"mock\": true and the UI badges them.\n"
            "           Drop your trained fusion_model.pt at "
            f"{FUSION_MODEL_CHECKPOINT} and set USE_MOCK_MODEL=false\n"
            "           to serve real results.\n"
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
    }


@app.post("/api/analyze-file")
async def analyze_file(file: UploadFile, user: dict = Depends(get_current_user)):
    """
    Non-live path: upload a full audio file, get a timeline of emotion results.

    The model takes a fixed 8-second input, so anything longer is split into
    consecutive windows and each is predicted separately — otherwise a long
    recording would be truncated to its first 8 seconds and reported as if it
    described the whole file. `emotion` carries the highest-confidence window
    so callers wanting a single headline result still have one.
    """
    raw_bytes = await file.read()

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

    windows = audio_utils.split_into_windows(waveform)
    if not windows:
        raise HTTPException(status_code=400, detail="Audio file contains no samples")

    segments = []
    for start_secs, end_secs, window in windows:
        window_wav = await run_blocking(audio_utils.waveform_to_wav_bytes, window)
        seg_transcript = await run_blocking(stt.transcribe, window_wav)
        seg_emotion = await run_blocking(emotion_model.predict, window, seg_transcript)
        segments.append(
            {
                "start": round(start_secs, 2),
                "end": round(end_secs, 2),
                "transcript": seg_transcript,
                "emotion": seg_emotion,
            }
        )

    headline = max(segments, key=lambda s: s["emotion"]["confidence"])
    full_transcript = " ".join(s["transcript"] for s in segments if s["transcript"]).strip()

    result = {
        "transcript": full_transcript,
        "emotion": headline["emotion"],
        "segments": segments,
        "duration_secs": round(waveform.shape[0] / audio_utils.SAMPLE_RATE, 2),
    }

    # Persistence is best-effort: a Supabase outage shouldn't cost the user
    # the analysis they just waited for.
    report_id = None
    try:
        storage_path = upload_audio_file(
            user["sub"], file.filename or "upload.wav", raw_bytes
        )
        saved = save_session_report(
            user["sub"],
            {
                **result,
                "type": "upload",
                "filename": file.filename,
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

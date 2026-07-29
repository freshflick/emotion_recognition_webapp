import os

from fastapi import FastAPI, UploadFile, Depends, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from auth import get_current_user
from config import FUSION_MODEL_CHECKPOINT, DEVICE
from models import stt, audio_utils, emotion_model
from storage import save_session_report, upload_audio_file, get_user_reports
from websocket_handler import handle_audio_session, run_blocking

app = FastAPI(title="Emotion Monitoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # add prod domain later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def load_models():
    """Loads Whisper + your trained fusion checkpoint once, at process startup."""
    stt.load_model()

    if os.path.exists(FUSION_MODEL_CHECKPOINT):
        emotion_model.load_model(FUSION_MODEL_CHECKPOINT, device=DEVICE)
        print(f"[startup] fusion model loaded from {FUSION_MODEL_CHECKPOINT}")
    else:
        print(
            f"[startup][WARNING] no checkpoint found at {FUSION_MODEL_CHECKPOINT} — "
            "/api/analyze-file and the live WebSocket will fail until you copy "
            "your trained fusion_model.pt there (or set FUSION_MODEL_CHECKPOINT in .env)"
        )


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": emotion_model.is_loaded(),
    }


@app.post("/api/analyze-file")
async def analyze_file(file: UploadFile, user: dict = Depends(get_current_user)):
    """
    Non-live path: user uploads a full audio file, gets one emotion result back.
    """
    raw_bytes = await file.read()

    ext = (file.filename or "").split(".")[-1].lower() or "wav"
    wav_bytes = await run_blocking(audio_utils.to_wav_pcm16, raw_bytes, ext)
    waveform = await run_blocking(audio_utils.bytes_to_model_waveform, wav_bytes)

    transcript = await run_blocking(stt.transcribe, wav_bytes)
    emotion_result = await run_blocking(emotion_model.predict, waveform, transcript)

    result = {"transcript": transcript, "emotion": emotion_result}

    storage_path = upload_audio_file(user["sub"], file.filename or "upload.wav", raw_bytes)
    saved = save_session_report(user["sub"], {**result, "audio_path": storage_path})

    return {**result, "report_id": saved.get("id")}


@app.get("/api/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    return get_user_reports(user["sub"])


@app.websocket("/ws/live-session")
async def live_session(websocket: WebSocket):
    await handle_audio_session(websocket)


# --- Serve React's production build as static files ---
# Only present after `npm run build` has been run and copied here.
# In dev, React runs on its own server (see vite proxy config) — this mount
# is a no-op locally if the folder doesn't exist yet.
FRONTEND_BUILD_DIR = "frontend/build"
if os.path.isdir(FRONTEND_BUILD_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="static")

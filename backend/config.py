"""
Central configuration. Loads from environment variables (.env in dev).
"""
import os
from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


# --- Dev switches ---
# DISABLE_AUTH skips JWT verification entirely and treats every caller as
# DEV_USER_ID. It exists so the frontend can be developed against a real
# running model before anyone has Supabase credentials. Guarded loudly at
# startup in main.py — never enable it on a deployed instance.
DISABLE_AUTH = _flag("DISABLE_AUTH")
DEV_USER_ID = os.getenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000000")

# USE_MOCK_MODEL is an explicit development switch. A missing checkpoint is a
# startup error rather than an implicit fallback, so a real deployment cannot
# silently serve random predictions.
USE_MOCK_MODEL = _flag("USE_MOCK_MODEL")

# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else "")

# Persistence is optional: without credentials the API still serves
# predictions, it just can't save or list reports.
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_SECRET_KEY)

# --- CORS ---
# Vite dev server defaults, plus anything in ALLOWED_ORIGINS (comma-separated)
# so the deployed frontend domain can be added without a code change.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if o.strip()
]

# --- Whisper (speech-to-text, feeds the text branch of your fusion model) ---
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small.en")  # tiny.en/base.en/small.en/medium.en
# A separate lightweight model keeps partial captions responsive while the
# larger model remains responsible for the final sentence transcript.
WHISPER_PREVIEW_MODEL_SIZE = os.getenv("WHISPER_PREVIEW_MODEL_SIZE", "base.en")

# --- Speaker diarization ----------------------------------------------------
SPEAKER_MODEL_NAME = os.getenv(
    "SPEAKER_MODEL_NAME", "speechbrain/spkrec-ecapa-voxceleb"
)

# Cosine similarity an utterance must reach against the enrolled subject's voice
# profile to be counted as theirs. Same-speaker ECAPA embeddings typically sit
# around 0.6-0.8 and different speakers around 0.0-0.3, so the midpoint is a
# reasonable default; lower it to be more inclusive, raise it to be stricter.
SUBJECT_MATCH_SIMILARITY = float(os.getenv("SUBJECT_MATCH_SIMILARITY", "0.45"))

# Uploaded conversations are cut into shorter windows than the live stream so
# that a window is unlikely to contain two different speakers at once.
UPLOAD_WINDOW_SECONDS = float(os.getenv("UPLOAD_WINDOW_SECONDS", "4.0"))

# --- Your trained fusion model ---
# Path to the trained fusion checkpoint. Point this at the checkpoint location
# on another machine when running outside the repository.
FUSION_MODEL_CHECKPOINT = os.getenv(
    "FUSION_MODEL_CHECKPOINT", "checkpoints/iemocap_e2v_large_model.pt"
)

import multiprocessing

# --- Runtime ---
DEVICE = os.getenv("DEVICE", "cpu")
INFERENCE_WORKERS = int(os.getenv("INFERENCE_WORKERS", str(min(multiprocessing.cpu_count(), 4))))

# --- Audio format, must match dataset.py exactly ---
SAMPLE_RATE = 16_000
MAX_AUDIO_SECS = 8
MAX_AUDIO_SAMPLES = SAMPLE_RATE * MAX_AUDIO_SECS

# ── Utterance endpointing ────────────────────────────────────────────────
# Live turns are cut by the *client* on detected silence, not on a timer, so a
# sentence is not guillotined mid-word. MAX_UTTERANCE_SECS bounds the
# client-driven case: a monologue that never pauses still gets analysed every so
# often rather than growing without limit. MIN_UTTERANCE_SECS discards anything
# shorter as not a real turn (a cough, a click) — Whisper tends to hallucinate
# on near-silence, so analysing it would invent a reading.
# Independent of MAX_AUDIO_SECS above: that is the model's fixed input window,
# these decide how often the model runs during a live session.
MAX_UTTERANCE_SECS = float(os.getenv("MAX_UTTERANCE_SECS", "12.0"))
MIN_UTTERANCE_SECS = float(os.getenv("MIN_UTTERANCE_SECS", "0.6"))

# Rolling emotion previews keep the live card responsive while a sentence is
# still being spoken. They are provisional and never enter the saved report.
PREVIEW_INTERVAL_SECS = float(os.getenv("PREVIEW_INTERVAL_SECS", "0.8"))
PREVIEW_MIN_SECS = float(os.getenv("PREVIEW_MIN_SECS", "0.5"))

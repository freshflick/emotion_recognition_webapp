"""
Central configuration. Loads from environment variables (.env in dev).
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# --- Whisper (speech-to-text, feeds the text branch of your fusion model) ---
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")  # tiny/base/small/medium

# --- Your trained fusion model ---
# Path to the checkpoint train.py saves (outputs/models/fusion_model.pt).
# Copy that file into this project (e.g. into ./checkpoints/) once training
# is done, or point this at wherever it lives on the GPU box.
FUSION_MODEL_CHECKPOINT = os.getenv(
    "FUSION_MODEL_CHECKPOINT", "checkpoints/fusion_model.pt"
)

# --- Runtime ---
DEVICE = os.getenv("DEVICE", "cpu")  # set to "cuda" once you're on the GPU box
INFERENCE_WORKERS = int(os.getenv("INFERENCE_WORKERS", "2"))

# --- Audio format, must match dataset.py exactly ---
SAMPLE_RATE = 16_000
MAX_AUDIO_SECS = 8
MAX_AUDIO_SAMPLES = SAMPLE_RATE * MAX_AUDIO_SECS

# --- Live session chunking ---
# How much raw (pre-conversion) audio to buffer before running one prediction.
# This is independent of MAX_AUDIO_SECS above — that's the model's fixed
# input window; this is how often you re-run the model during a live session.
CHUNK_THRESHOLD_BYTES = int(os.getenv("CHUNK_THRESHOLD_BYTES", str(32000 * 4)))  # ~4s of raw PCM16

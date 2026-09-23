"""
Modal deployment wrapper for the emotion_recognition_webapp backend.

This does NOT rewrite any of your model/inference code — it just wraps your
existing FastAPI app (from main.py) so Modal can build the right container,
give it a GPU, and serve it over HTTPS + WebSocket.

--- MOCK MODE (no trained checkpoint yet — start here) ---

No fusion_model.pt exists locally, so this is currently set to run with
USE_MOCK_MODEL=true baked into the secret below. This skips the Volume
entirely and lets you validate the Modal deployment itself: does the image
build, does the WebSocket hold up, does CORS work against your frontend,
what's cold-start latency like. Predictions will be randomised placeholders
(tagged "mock": true), matching how main.py already behaves locally without
a checkpoint.

1. Create a Modal Secret with the env vars config.py actually reads:
     modal secret create emotion-app-secrets \
       USE_MOCK_MODEL=true \
       ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app \
       WHISPER_MODEL_SIZE=small \
       DEVICE=cuda \
       DISABLE_AUTH=false
   (SUPABASE_URL / SUPABASE_SECRET_KEY are omitted here — optional, only
   needed once you want reports actually saved/listed.)

2. Run this file from your backend/ folder (so main.py, auth.py, config.py,
   storage.py, websocket_handler.py, and models/ are all next to it):
     modal serve modal_app.py      # test with a temporary URL
     modal deploy modal_app.py     # get a permanent URL

--- Once you have a real fusion_model.pt (later) ---

1. Upload it to a Volume:
     modal volume create emotion-model-checkpoints
     modal volume put emotion-model-checkpoints /path/to/fusion_model.pt fusion_model.pt

2. Uncomment the `volumes={...}` line in @app.function below.

3. Update the secret: USE_MOCK_MODEL=false, and add SUPABASE_URL /
   SUPABASE_SECRET_KEY if you want persistence.
"""

import modal

app = modal.App("emotion-recognition-webapp")

# --- Container image: mirrors requirements.txt, plus ffmpeg for pydub ---
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi==0.115.6",
        "uvicorn[standard]==0.34.0",
        "python-multipart==0.0.20",
        "python-dotenv==1.0.1",
        "pyjwt==2.10.1",
        "cryptography==44.0.0",
        "supabase==2.11.0",
        "faster-whisper>=1.0.0",
        "pydub==0.25.1",
        "torchaudio==2.5.1",
        "soundfile==0.12.1",
        "torch==2.5.1",
        "transformers==4.47.1",
        "sentencepiece==0.2.0",
        "numpy==1.26.4",
        "funasr>=1.0.0",
        "librosa>=0.10.0",
        "modelscope>=1.10.0",
    )
    # Ships your actual backend source (main.py, auth.py, config.py, storage.py,
    # websocket_handler.py, models/) into the image so `from main import app` works.
    .add_local_python_source(
        "main", "auth", "config", "storage", "websocket_handler", "models"
    )
)

# --- Persistent storage for the checkpoint, once you have one to upload ---
# Not used yet in mock mode — uncomment the volumes={...} line below once
# you've run the `modal volume create` / `modal volume put` steps above.
checkpoint_volume = modal.Volume.from_name(
    "emotion-model-checkpoints", create_if_missing=True
)
CHECKPOINT_DIR = "/checkpoints"


@app.function(
    image=image,
    # gpu="T4",  # commented out — needs a payment method on file. Uncomment
    #             # once you add one; not needed yet since USE_MOCK_MODEL=true
    #             # doesn't actually load or run the real model.
    # volumes={CHECKPOINT_DIR: checkpoint_volume},  # uncomment once you have a checkpoint
    secrets=[modal.Secret.from_name("emotion-app-secrets")],
    timeout=600,
    # min_containers=1,  # uncomment once you're past testing — keeps a warm
    #                     # instance alive so the WebSocket doesn't cold-start
    #                     # mid-session. Costs money continuously, so leave
    #                     # this off while you're just evaluating Modal.
)
@modal.asgi_app()
def fastapi_app():
    from main import app as web_app  # your existing FastAPI app, untouched

    return web_app
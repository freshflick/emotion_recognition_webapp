"""Modal deployment for the GPU-backed FastAPI/WebSocket backend.

Deploy from the repository root:

    modal deploy deploy/modal_app.py

The checkpoint and downloaded Hugging Face/ModelScope/SpeechBrain caches live
in a Modal Volume. Secrets are created in Modal and are never committed here.
"""

import os
import sys
from pathlib import Path

import modal


ROOT = Path(__file__).resolve().parents[1]
MODEL_VOLUME_NAME = "emotion-monitor-models"
MODEL_VOLUME = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements(str(ROOT / "backend" / "requirements.txt"))
    .add_local_dir(str(ROOT / "backend"), remote_path="/app/backend")
)

app = modal.App("emotion-monitor-backend")


@app.function(
    image=image,
    cpu=1.0,
    memory=2048,
    secrets=[modal.Secret.from_name("emotion-monitor-secrets")],
    timeout=120,
    scaledown_window=60,
)
@modal.asgi_app()
def control_api():
    sys.path.insert(0, "/app/backend")
    from control_app import app as control_app_instance

    return control_app_instance


@app.function(
    image=image,
    gpu=os.getenv("MODAL_GPU", "L4"),
    cpu=4.0,
    memory=(32768, 49152),
    volumes={"/models": MODEL_VOLUME},
    secrets=[modal.Secret.from_name("emotion-monitor-secrets")],
    timeout=1800,
    # Keep the GPU warm for five minutes after the last request, then allow it
    # to scale to zero to limit idle charges.
    scaledown_window=300,
)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def fastapi_app():
    # Keep model downloads and the trained checkpoint on the persistent volume.
    os.environ.setdefault("HOME", "/models/home")
    os.environ.setdefault("HF_HOME", "/models/home/.cache/huggingface")
    os.environ.setdefault("MODELSCOPE_CACHE", "/models/home/.cache/modelscope")
    # These must override local `.env` values accidentally copied into a
    # secret; the hosted app must use the mounted GPU/checkpoint and never
    # expose a development auth or mock-model setting.
    os.environ["DEVICE"] = "cuda"
    os.environ["FUSION_MODEL_CHECKPOINT"] = "/models/iemocap_e2v_large_model.pt"
    os.environ["USE_MOCK_MODEL"] = "false"
    os.environ["DISABLE_AUTH"] = "false"
    # Avoid a stale Modal secret overriding the smoother sentence-sized live
    # buffer. The inference model accepts at most eight seconds of audio.
    os.environ["MAX_UTTERANCE_SECS"] = "8.0"

    sys.path.insert(0, "/app/backend")
    from main import app as fastapi_app_instance

    return fastapi_app_instance

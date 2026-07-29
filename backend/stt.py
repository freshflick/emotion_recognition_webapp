"""
Speech-to-text via OpenAI Whisper (local, open-weight — not the paid API).
Loaded once at startup; `transcribe()` is a blocking call meant to be run
inside a thread pool executor, never awaited directly.
"""
import io
import tempfile

import numpy as np
import whisper

from config import WHISPER_MODEL_SIZE, DEVICE

_model = None


def load_model():
    global _model
    _model = whisper.load_model(WHISPER_MODEL_SIZE, device=DEVICE)


def transcribe(audio_bytes: bytes) -> str:
    """
    audio_bytes: raw audio (wav/pcm). Whisper's `transcribe` accepts a file
    path or a numpy float32 array; writing to a temp file is the simplest
    reliable path for arbitrary incoming formats.
    """
    if _model is None:
        raise RuntimeError("Whisper model not loaded — call load_model() at startup")

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        result = _model.transcribe(tmp.name, fp16=False)

    return result.get("text", "").strip()

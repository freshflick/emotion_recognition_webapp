"""
Speech-to-text via OpenAI Whisper (local, open-weight — not the paid API).
Loaded once at startup; `transcribe()` is a blocking call meant to be run
inside a thread pool executor, never awaited directly.
"""
import random
import tempfile

from config import DEVICE, WHISPER_MODEL_SIZE

_model = None
_mock_mode = False

# Only used when mock mode is on, so the live transcript panel has something
# to render before the real pipeline is available.
_MOCK_PHRASES = [
    "I'm really pleased with how this turned out",
    "That's not what we agreed on at all",
    "Let me walk you through the results",
    "I honestly don't know how to feel about it",
    "This has been a difficult few weeks",
    "Thanks for taking the time to listen",
]


def load_model():
    global _model
    import whisper  # imported lazily so mock mode needs no model download

    _model = whisper.load_model(WHISPER_MODEL_SIZE, device=DEVICE)


def enable_mock_mode():
    """Return canned transcripts instead of running Whisper. See emotion_model."""
    global _mock_mode
    _mock_mode = True


def is_mock() -> bool:
    return _mock_mode


def transcribe(audio_bytes: bytes) -> str:
    """
    audio_bytes: raw audio (wav/pcm). Whisper's `transcribe` accepts a file
    path or a numpy float32 array; writing to a temp file is the simplest
    reliable path for arbitrary incoming formats.
    """
    if _mock_mode:
        return random.choice(_MOCK_PHRASES)

    if _model is None:
        raise RuntimeError("Whisper model not loaded — call load_model() at startup")

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        result = _model.transcribe(tmp.name, fp16=False)

    return result.get("text", "").strip()

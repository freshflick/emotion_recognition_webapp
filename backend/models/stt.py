"""
Speech-to-text via Faster-Whisper (CTranslate2 optimised local Whisper).
4x faster than openai-whisper, same accuracy, lower memory usage.
Loaded once at startup; `transcribe()` is a blocking call meant to be run
inside a thread pool executor, never awaited directly.
"""
import random
import tempfile
import struct
import io

from config import DEVICE, WHISPER_MODEL_SIZE, WHISPER_PREVIEW_MODEL_SIZE

_model = None
_preview_model = None
_mock_mode = False

_MOCK_PHRASES = [
    "I'm really pleased with how this turned out",
    "That's not what we agreed on at all",
    "Let me walk you through the results",
    "I honestly don't know how to feel about it",
    "This has been a difficult few weeks",
    "Thanks for taking the time to listen",
]

_HALLUCINATION_PATTERNS = {
    "i can't read it", "i cannot read it", "i can't read that",
    "this is a real conversation", "people express emotions",
}

_HALLUCINATION_SUBSTRINGS = [
    "thanks for watching",
    "hope you enjoyed",
    "see you in the next",
    "don't forget to",
    "like and subscribe",
    "thank you very much",
    "thank you so much",
    "thank you for watching",
]


def load_model():
    global _model, _preview_model
    from faster_whisper import WhisperModel

    compute_type = "int8" if DEVICE == "cpu" else "float16"
    _model = WhisperModel(WHISPER_MODEL_SIZE, device=DEVICE, compute_type=compute_type)
    if WHISPER_PREVIEW_MODEL_SIZE == WHISPER_MODEL_SIZE:
        _preview_model = _model
    else:
        _preview_model = WhisperModel(
            WHISPER_PREVIEW_MODEL_SIZE,
            device=DEVICE,
            compute_type=compute_type,
        )


def enable_mock_mode():
    global _mock_mode
    _mock_mode = True


def is_mock() -> bool:
    return _mock_mode


def transcribe(
    audio_bytes: bytes,
    ignore_before_secs: float = 0.0,
    preview: bool = False,
) -> str:
    if _mock_mode:
        return random.choice(_MOCK_PHRASES)

    model = _preview_model if preview else _model
    if model is None:
        raise RuntimeError("Whisper model not loaded — call load_model() at startup")

    # Quick silence check: compute RMS energy from raw PCM
    # WAV header is 44 bytes, rest is PCM16 samples
    if len(audio_bytes) > 44:
        pcm = audio_bytes[44:]
        samples = struct.unpack(f"<{len(pcm)//2}h", pcm)
        if samples:
            rms = (sum(s*s for s in samples) / len(samples)) ** 0.5
            if rms < 100:  # raise threshold to catch more noise
                return ""
            # Also reject very short audio (< 0.5s) — likely noise
            duration = len(samples) / 16000
            if duration < 0.5:
                return ""

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        segments, info = model.transcribe(
            tmp.name,
            language="en",
            beam_size=2 if preview else 5,
            best_of=1,
            repetition_penalty=1.05,
            no_repeat_ngram_size=0,
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            suppress_blank=True,
            hallucination_silence_threshold=1.5,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": 350,
                "speech_pad_ms": 300,
            },
        )
        accepted_segments = []
        for segment in segments:
            # VAD can still pass clicks, breaths, or room noise. Faster-Whisper
            # exposes confidence signals per segment; discard output it also
            # considers uncertain, repetitive, or likely non-speech.
            if segment.no_speech_prob > 0.65:
                continue
            if segment.avg_logprob < -0.9:
                continue
            if segment.compression_ratio > 2.4:
                continue
            if ignore_before_secs > 0 and segment.words:
                # The beginning is overlap from the previous live chunk. Keep
                # words crossing the boundary, but do not emit old words twice.
                words = [
                    word.word
                    for word in segment.words
                    if word.end > ignore_before_secs + 0.05
                ]
                segment_text = "".join(words).strip()
            else:
                segment_text = segment.text.strip()
            if segment_text:
                accepted_segments.append(segment_text)
        text = " ".join(accepted_segments).strip()

    # Filter hallucinations
    if text.lower().strip(".!") in _HALLUCINATION_PATTERNS:
        return ""

    # Filter partial hallucinations (e.g., "Thanks for watching, I hope you enjoyed this video")
    text_lower = text.lower()
    for substr in _HALLUCINATION_SUBSTRINGS:
        if substr in text_lower:
            return ""

    # Reject useless single-character outputs (just "." or punctuation)
    if len(text.strip()) <= 2:
        return ""

    # Reject garbled/stretched output
    if len(text.split()) > 40:
        return ""

    # Reject dashed/garbled text (e.g., "------ --- ---")
    if text.count('-') > 3 or text.count('.') > 5:
        return ""

    # Fix missing spaces after punctuation (e.g., "AndHonestly" -> "And Honestly")
    import re
    text = re.sub(r'([.!?,;:])([A-Za-z])', r'\1 \2', text)
    text = re.sub(r'\s+', ' ', text).strip()

    # Deduplicate consecutive repeated words
    words = text.split()
    deduped = []
    for w in words:
        if not deduped or w.lower() != deduped[-1].lower():
            deduped.append(w)
    text = " ".join(deduped)

    return text

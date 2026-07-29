"""
Two jobs:

1. Browsers record audio as WebM/Opus (MediaRecorder default), not raw
   WAV/PCM — `to_wav_pcm16` converts whatever comes in to 16kHz mono WAV.
   Requires ffmpeg installed on the host.

2. `bytes_to_model_waveform` reproduces your dataset.py's `_load_audio`
   logic exactly (mono, resample to 16kHz, pad/truncate to a fixed 8-second
   length) so inference audio is preprocessed identically to how the model
   was trained — this matters, mismatched preprocessing between training
   and inference is one of the most common causes of a model that "worked
   in testing" doing badly in production.
"""
import io
import torch
import torchaudio
from pydub import AudioSegment

from config import SAMPLE_RATE, MAX_AUDIO_SAMPLES


def to_wav_pcm16(raw_bytes: bytes, source_format: str = "webm") -> bytes:
    """Converts arbitrary browser-recorded audio to 16kHz mono WAV bytes."""
    audio = AudioSegment.from_file(io.BytesIO(raw_bytes), format=source_format)
    audio = audio.set_frame_rate(SAMPLE_RATE).set_channels(1).set_sample_width(2)
    out = io.BytesIO()
    audio.export(out, format="wav")
    return out.getvalue()


def bytes_to_model_waveform(wav_bytes: bytes) -> torch.Tensor:
    """
    Mirrors IEMOCAPDataset._load_audio in dataset.py:
      - mono
      - resample to 16kHz
      - pad or truncate to exactly MAX_AUDIO_SAMPLES (8 seconds)
    Input must already be WAV — run to_wav_pcm16() first if the source
    is browser-recorded WebM/Opus.
    """
    waveform, sr = torchaudio.load(io.BytesIO(wav_bytes))  # [C, T]

    if waveform.ndim == 2 and waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if waveform.ndim == 2:
        waveform = waveform.squeeze(0)  # [T]

    waveform = waveform.to(torch.float32)

    if sr != SAMPLE_RATE:
        waveform = torchaudio.functional.resample(waveform, sr, SAMPLE_RATE)

    if waveform.shape[0] < MAX_AUDIO_SAMPLES:
        pad = MAX_AUDIO_SAMPLES - waveform.shape[0]
        waveform = torch.nn.functional.pad(waveform, (0, pad))
    else:
        waveform = waveform[:MAX_AUDIO_SAMPLES]

    return waveform

"""
Compute benchmark for the emotion backend — times the backend's REAL code path.

It calls the same functions the server does:
    models.stt.load_model() / stt.transcribe(wav_bytes)
    models.emotion_model.load_model() / emotion_model.predict(waveform, text)

No trained fusion_model.pt is needed. load_model() is run with the checkpoint
read skipped, so the fusion head keeps random weights. Almost all of the
compute is in the pretrained backbones (emotion2vec_plus_large + EmoBERTa-large
+ Whisper), so latency and memory match what the trained model will cost.
Predicted labels are meaningless until a real checkpoint is loaded.

Real-time budget for live sessions: stt + fusion must finish within one chunk
(CHUNK_THRESHOLD_BYTES in config.py, currently 3 s of audio).

Usage (from backend/benchmarks/):
    python bench.py [--device cpu|mps|cuda] [--whisper base.en,small.en]
                    [--quant none,int8,fp16] [--threads N] [--runs 5] [--out f.json]
"""
import argparse, io, json, os, platform, sys, time
import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.environ.get("BACKEND_DIR", os.path.dirname(HERE))
sys.path.insert(0, BACKEND)

import config  # noqa: E402
from models import emotion_model as em, stt  # noqa: E402

CHUNK_SECS = config.CHUNK_THRESHOLD_BYTES / (config.SAMPLE_RATE * 2)  # PCM16 mono


def rss_mb():
    import psutil
    return psutil.Process().memory_info().rss / 1e6


def sync(device):
    if device == "cuda":
        torch.cuda.synchronize()
    elif device == "mps":
        torch.mps.synchronize()


def load_clip():
    """16 kHz mono float32 speech. BENCH_WAV overrides the bundled clip."""
    import soundfile as sf
    path = os.environ.get("BENCH_WAV", os.path.join(HERE, "speech.wav"))
    w, sr = sf.read(path, dtype="float32")
    if w.ndim > 1:
        w = w.mean(1)
    if sr != config.SAMPLE_RATE:
        import torchaudio.functional as F
        w = F.resample(torch.from_numpy(w), sr, config.SAMPLE_RATE).numpy()
    return w, os.path.basename(path)


def to_wav_bytes(samples):
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, samples, config.SAMPLE_RATE, subtype="PCM_16", format="WAV")
    return buf.getvalue()


def timed(fn, runs, device):
    fn(); sync(device)  # warmup
    ts = []
    for _ in range(runs):
        t0 = time.perf_counter(); fn(); sync(device)
        ts.append(time.perf_counter() - t0)
    return {"median_s": float(np.median(ts)), "min_s": float(min(ts)), "max_s": float(max(ts))}


def load_without_checkpoint(device):
    """Run em.load_model() exactly as the server does, but skip reading weights."""
    real_load, real_lsd = torch.load, em.FusionEmotionModel.load_state_dict
    torch.load = lambda *a, **k: {}
    em.FusionEmotionModel.load_state_dict = lambda self, *a, **k: None
    try:
        em.load_model("<no checkpoint: random fusion head>", device=device)
    finally:
        torch.load, em.FusionEmotionModel.load_state_dict = real_load, real_lsd


def build_fusion(device, quant, smoke_test):
    t0 = time.perf_counter()
    load_without_checkpoint(device)
    if quant == "int8":
        engines = torch.backends.quantized.supported_engines
        arm = platform.machine() in ("arm64", "aarch64")
        torch.backends.quantized.engine = "qnnpack" if arm and "qnnpack" in engines else "fbgemm"
        base = em._model
        em._model = torch.ao.quantization.quantize_dynamic(base, {torch.nn.Linear}, dtype=torch.qint8)
        try:
            smoke_test()
        except Exception:
            # Some attention implementations read q/k/v_proj.weight as a tensor,
            # which quantized Linear doesn't expose. Keep those in fp32.
            skip = ("q_proj", "k_proj", "v_proj", "out_proj")
            names = {n for n, mod in base.named_modules()
                     if isinstance(mod, torch.nn.Linear) and not n.endswith(skip)}
            em._model = torch.ao.quantization.quantize_dynamic(base, names, dtype=torch.qint8)
    elif quant == "fp16":
        m = em._model.half()
        orig = m.forward
        m.forward = lambda a, i, am, r, n, **kw: orig(a.half(), i, am, r.half(), n.half(), **kw)
    return time.perf_counter() - t0


def bench_stt(size, device, wav_bytes, runs):
    stt.WHISPER_MODEL_SIZE = size
    stt.DEVICE = "cuda" if device == "cuda" else "cpu"  # CTranslate2 has no MPS backend
    t0 = time.perf_counter()
    stt.load_model()
    load = time.perf_counter() - t0
    r = timed(lambda: stt.transcribe(wav_bytes), runs, device)
    r["load_s"] = load
    r["transcript"] = stt.transcribe(wav_bytes)
    stt._model = None
    return r


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--device", default="cpu")
    p.add_argument("--whisper", default="base.en,small.en")
    p.add_argument("--quant", default="none,int8")
    p.add_argument("--threads", type=int, default=0)
    p.add_argument("--runs", type=int, default=5)
    p.add_argument("--label", default="")
    p.add_argument("--out", default="")
    a = p.parse_args()

    if a.threads:
        torch.set_num_threads(a.threads)
    dev = a.device
    clip, clip_name = load_clip()
    window = torch.from_numpy(np.pad(clip, (0, max(0, em.MAX_AUDIO_SAMPLES - clip.size)))[: em.MAX_AUDIO_SAMPLES])
    chunk_wav = to_wav_bytes(clip[: int(config.SAMPLE_RATE * CHUNK_SECS)])
    text = "I honestly cannot believe this happened again today"

    info = {
        "label": a.label or f"{platform.node()}-{dev}",
        "device": dev,
        "torch": torch.__version__,
        "threads": torch.get_num_threads(),
        "cpu": platform.machine(),
        "cpu_count": os.cpu_count(),
        "gpu": torch.cuda.get_device_name(0) if dev == "cuda" else None,
        "clip": clip_name,
        "chunk_secs": CHUNK_SECS,
        "audio_model": em.AUDIO_MODEL_NAME,
        "text_model": em.TEXT_MODEL_NAME,
        "fusion": {},
        "stt": {},
    }
    print(json.dumps({k: v for k, v in info.items() if k not in ("fusion", "stt")}), flush=True)

    for q in [x for x in a.quant.split(",") if x]:
        load = build_fusion(dev, q, lambda: em.predict(window, text))
        r = timed(lambda: em.predict(window, text), a.runs, dev)
        r["load_s"] = load
        r["rss_mb"] = rss_mb()
        if dev == "cuda":
            r["vram_peak_mb"] = torch.cuda.max_memory_allocated() / 1e6
        info["fusion"][q] = r
        print(f"fusion[{q}]", json.dumps(r), flush=True)
        em._model = None
        if dev == "cuda":
            torch.cuda.empty_cache()

    for s in [x for x in a.whisper.split(",") if x]:
        r = bench_stt(s, dev, chunk_wav, a.runs)
        r["rss_mb"] = rss_mb()
        info["stt"][s] = r
        print(f"stt[{s}]", json.dumps(r), flush=True)

    if a.out:
        with open(a.out, "w") as f:
            json.dump(info, f, indent=2)
    return info


if __name__ == "__main__":
    main()

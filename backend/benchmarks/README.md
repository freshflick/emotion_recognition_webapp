# Hosting benchmarks

Tested whether the backend can run on a cloud CPU or needs a GPU. This uses the model on `main`:
emotion2vec_plus_large + EmoBERTa-large, with faster-whisper for speech-to-text.

## Result

**A 4 vCPU cloud CPU is enough for live sessions. No GPU needed.**

In a live session the server runs Whisper + the fusion model once per chunk. Chunks arrive every
**3 s** (`CHUNK_THRESHOLD_BYTES` in `config.py`), so both together have to finish in under 3 s
or the session falls behind.

Seconds per 3 s chunk, measured on Modal (x86 CPUs, median of 5 runs):

| Fusion model + Whisper | 2 vCPU | 4 vCPU | 8 vCPU |
|---|---|---|---|
| fp32 + `small.en` (**what `main` does today**) | 3.26 ❌ | **2.50 ✅** | 2.34 ✅ |
| int8 + `small.en` | 2.91 ⚠️ | **2.11 ✅** | 1.94 ✅ |
| int8 + `base.en` | 1.37 ✅ | 1.18 ✅ | 1.11 ✅ |

The two parts separately:

| | 2 vCPU | 4 vCPU | 8 vCPU |
|---|---|---|---|
| Fusion model, fp32 (one 8 s window) | 0.96 s | 1.00 s | 1.04 s |
| Fusion model, int8 | 0.61 s | 0.61 s | 0.64 s |
| Whisper `base.en` (3 s chunk) | 0.76 s | 0.57 s | 0.47 s |
| Whisper `small.en` (3 s chunk) | 2.30 s | 1.50 s | 1.30 s |

What the numbers show:
- **2 vCPU is too slow** with the current setup (3.26 s). It only works if Whisper drops to `base.en`.
- **4 vCPU works as-is** (2.50 s), without code changes. int8 brings it to 2.11 s for more headroom.
- **More cores barely help the fusion model** (~1 s at 2, 4 or 8 vCPU). They mainly speed up Whisper.
- **Memory: plan for 8 GB.** The process used ~6.4 GB with the fp32 model and Whisper loaded.
- **Cold start is slow:** loading the models takes ~15-20 s, plus the ~3 GB download if the models
  aren't built into the container image.

## Recommendation

1. **Host on Modal CPU, 4 vCPU and 8 GB of memory.** It scales to zero, so it costs nothing when
   idle, and Aaron's `modal_app.py` already deploys the app. In `modal_app.py`: set `cpu=4.0` and
   `memory=8192`, and download the models while building the image so cold starts don't
   re-download 3 GB.
2. **Optional: int8 quantisation** of the fusion model (~40% faster fusion). This is **not in the
   backend yet**. Once `fusion_model.pt` exists, check that int8 predictions match fp32 before
   switching.
3. **GPU is not needed** for live sessions. It could still help long file uploads: a 5 min file is
   ~38 windows, i.e. ~1-2 min of processing on 4 vCPU. GPUs weren't tested (Modal needs a card on
   file for GPUs).

## Caveats

- **Fusion head is random.** No trained `fusion_model.pt` exists yet, so the benchmark runs
  `load_model()` without reading a checkpoint. Almost all the compute is in the pretrained
  backbones, so timings are representative, but predicted labels are meaningless.
- **Only one CPU type tested.** Modal CPUs are x86 server cores. Other hosts' vCPUs may be somewhat
  faster or slower, and Modal's `cpu=` is a minimum, so a container can occasionally use spare
  cores. Treat the 2 vCPU column as a best case.
- **Test clip:** a single synthetic speech clip (macOS `say`), ~6.6 s long.

## How it works / rerunning

`bench.py` calls the backend's own code (`models.stt.load_model/transcribe` and
`models.emotion_model.load_model/predict`), so it measures exactly what the server does,
including `beam_size=5` in Whisper.

```bash
cd backend/benchmarks
pip install modal && modal setup
modal run modal_bench.py                               # 2/4/8 vCPU, no card needed, costs cents
BENCH_GPU=1 modal run modal_bench.py --targets t4,l4   # GPUs, needs a payment method
```

Results are written to `results/modal-<target>.json`. `bench.py` can also run locally
(`python bench.py --device cpu|mps|cuda`) if the models are downloaded.

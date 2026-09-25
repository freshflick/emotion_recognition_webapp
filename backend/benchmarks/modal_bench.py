"""
Runs bench.py on Modal hardware to get real cloud numbers (x86 CPUs, GPUs).
Uses the backend's own models/ and config.py; no trained checkpoint needed
(see bench.py docstring).

From backend/benchmarks/:
    pip install modal && modal setup
    modal run modal_bench.py                                 # CPU targets, no card needed
    modal run modal_bench.py --targets cpu4
    BENCH_GPU=1 modal run modal_bench.py --targets t4,l4     # GPUs, needs a payment method

Each target takes ~5-10 min (image build on first run + ~3 GB of model
downloads per container). CPU runs cost cents.
Results are printed and written to results/modal-<target>.json.
"""
import json
import os

import modal

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
app = modal.App("emotion-bench")

# Mirrors backend/requirements.txt (model runtime only; no web/auth deps).
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.5.1", "torchaudio==2.5.1", "transformers==4.47.1",
        "sentencepiece==0.2.0", "numpy==1.26.4", "soundfile==0.12.1",
        "pydub==0.25.1", "python-dotenv==1.0.1", "faster-whisper>=1.0.0",
        "funasr>=1.0.0", "librosa>=0.10.0", "modelscope>=1.10.0",
        "huggingface_hub", "psutil",
    )
    .add_local_dir(f"{BACKEND}/models", "/root/backend/models", ignore=["__pycache__"])
    .add_local_file(f"{BACKEND}/config.py", "/root/backend/config.py")
    .add_local_file(f"{HERE}/bench.py", "/root/backend/benchmarks/bench.py")
    .add_local_file(f"{HERE}/speech.wav", "/root/backend/benchmarks/speech.wav")
)

# Each container downloads its own models (~3 GB, fast on Modal's network).
# A shared Volume cache is avoided on purpose: parallel targets writing the
# same files on first run can corrupt each other's downloads.
common = dict(image=image, timeout=3600)

# emotion_model.py loads emotion2vec from this fixed path.
E2V_DIR = "/root/.cache/modelscope/hub/iic/emotion2vec_plus_large"


def _run(label, device, quant):
    import subprocess, sys
    os.environ["DEVICE"] = device

    # Fetch emotion2vec into the path emotion_model.py expects. The HuggingFace
    # mirror is much faster than ModelScope from outside China.
    from huggingface_hub import snapshot_download
    snapshot_download("emotion2vec/emotion2vec_plus_large", local_dir=E2V_DIR,
                      allow_patterns=["model.pt", "config.yaml", "configuration.json", "tokens.txt"])

    out = f"/tmp/{label}.json"
    subprocess.run([sys.executable, "/root/backend/benchmarks/bench.py", "--device", device,
                    "--quant", quant, "--whisper", "base.en,small.en", "--runs", "5",
                    "--label", label, "--out", out], check=True)
    return json.load(open(out))


@app.function(cpu=2.0, memory=10240, **common)
def cpu2():
    return _run("modal-cpu-2vcpu", "cpu", "none,int8")


@app.function(cpu=4.0, memory=10240, **common)
def cpu4():
    return _run("modal-cpu-4vcpu", "cpu", "none,int8")


@app.function(cpu=8.0, memory=10240, **common)
def cpu8():
    return _run("modal-cpu-8vcpu", "cpu", "none,int8")


TARGETS = {"cpu2": cpu2, "cpu4": cpu4, "cpu8": cpu8}

# Modal validates every function in the app at startup and refuses GPU
# functions on accounts without a payment method, even if only CPU targets
# are run. So GPU functions are only registered when asked for (BENCH_GPU=1).
# Inside the container (not local) they're always defined so lookups resolve.
if os.environ.get("BENCH_GPU") == "1" or not modal.is_local():

    @app.function(gpu="T4", **common)
    def t4():
        return _run("modal-T4", "cuda", "none,fp16")

    @app.function(gpu="L4", **common)
    def l4():
        return _run("modal-L4", "cuda", "none,fp16")

    TARGETS.update({"t4": t4, "l4": l4})


@app.local_entrypoint()
def main(targets: str = "cpu2,cpu4,cpu8"):
    os.makedirs(f"{HERE}/results", exist_ok=True)
    calls = {t: TARGETS[t].spawn() for t in targets.split(",")}
    for t, call in calls.items():
        try:
            res = call.get()
        except Exception as e:
            print(f"[{t}] FAILED: {e}")
            continue
        with open(f"{HERE}/results/modal-{t}.json", "w") as f:
            json.dump(res, f, indent=2)
        print(f"[{t}] fusion " + ", ".join(f"{k}={v['median_s']:.2f}s" for k, v in res["fusion"].items())
              + " | stt " + ", ".join(f"{k}={v['median_s']:.2f}s" for k, v in res["stt"].items()))

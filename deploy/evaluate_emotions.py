"""Run a small labeled-audio comparison on an isolated Modal GPU app.

EVALUATION_AUDIO_DIR=/path/to/labeled/folders modal run deploy/evaluate_emotions.py --output /path/to/report.json
"""
import json
import os
from pathlib import Path
import subprocess
import sys

import modal


ROOT = Path(__file__).resolve().parents[1]
MODEL_VOLUME = modal.Volume.from_name("emotion-monitor-models")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements(str(ROOT / "backend" / "requirements.txt"))
    .add_local_dir(str(ROOT / "backend"), remote_path="/app/backend")
)

app = modal.App("emotion-monitor-evaluation")


@app.function(
    image=image,
    gpu="L4",
    cpu=4,
    memory=32768,
    volumes={"/models": MODEL_VOLUME},
    timeout=1200,
)
def evaluate(pipeline: str, samples_per_class: int, audio_files: list[tuple[str, str, bytes]]):
    audio_dir = Path("/tmp/emotion-evaluation-audio")
    for label, name, contents in audio_files:
        target = audio_dir / label / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)

    env = {
        **os.environ,
        "DEVICE": "cuda",
        "USE_MOCK_MODEL": "false",
        "FUSION_MODEL_CHECKPOINT": "/models/iemocap_e2v_large_model.pt",
        "HOME": "/models/home",
        "HF_HOME": "/models/home/.cache/huggingface",
        "MODELSCOPE_CACHE": "/models/home/.cache/modelscope",
    }
    report_path = "/tmp/emotion-evaluation.json"
    subprocess.run(
        [
            "python",
            "evaluate_emotions.py",
            str(audio_dir),
            "--pipeline",
            pipeline,
            "--samples-per-class",
            str(samples_per_class),
            "--output",
            report_path,
        ],
        cwd="/app/backend",
        env=env,
        stdout=subprocess.DEVNULL,
        check=True,
    )
    return json.loads(Path(report_path).read_text())


@app.local_entrypoint()
def main(output: str, pipeline: str = "upload", samples_per_class: int = 3):
    if pipeline not in ("upload", "live"):
        raise ValueError("pipeline must be upload or live")
    # Keep GPU work bounded to at most 12 balanced clips per run.
    if not 1 <= samples_per_class <= 3:
        raise ValueError("samples_per_class must be between 1 and 3 (12 clips maximum)")
    audio_dir = Path(os.environ.get("EVALUATION_AUDIO_DIR", "")).expanduser().resolve()
    if not audio_dir.is_dir():
        raise ValueError("Set EVALUATION_AUDIO_DIR to the labeled audio directory")

    # Imported only in the local entrypoint: the remote worker image contains
    # backend/, not the repository's deploy/ package.
    sys.path.insert(0, str(ROOT))
    from backend.evaluate_emotions import read_manifest, select_balanced_sample

    rows = select_balanced_sample(read_manifest(audio_dir), samples_per_class)
    audio_files = [
        (row["expected"], Path(row["path"]).name, Path(row["path"]).read_bytes())
        for row in rows
    ]
    if len(audio_files) > 12:
        raise ValueError("Refusing to submit more than 12 audio clips")

    print(f"Submitting {len(audio_files)} balanced clips to Modal ({pipeline} pipeline).", flush=True)
    report = evaluate.remote(pipeline, samples_per_class, audio_files)
    output_path = Path(output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {key: report[key] for key in ("metrics", "comparisons", "candidate_only")},
            indent=2,
        )
    )
    print(f"Full report written to {output_path}", flush=True)

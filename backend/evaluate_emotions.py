"""Offline paired evaluation of single-utterance audio; never changes production."""
import argparse
import csv
import inspect
import json
from pathlib import Path


LABELS = ("Neutral", "Happy", "Sad", "Angry")
BACKEND_LABELS = (*LABELS, "Frustrated")
VARIANTS = {
    "baseline": (2.0, True, 0.0),
    "no_keyword_fallback": (2.0, False, 0.0),
    "raw_no_fallback": (2.0, False, 0.0),
    "raw_learned_gate": (1.0, False, 0.0),
    "audio_focused": (2.5, False, 0.35),
}


def ui_label(label):
    return "Angry" if label == "Frustrated" else label


def read_manifest(path):
    if path.is_dir():
        rows = []
        for label in LABELS:
            for audio_path in sorted((path / label).glob("*.wav")):
                rows.append({"path": str(audio_path.resolve()), "label": label,
                             "expected": label, "transcript": ""})
        if not rows:
            raise ValueError("Audio directory needs Neutral/Happy/Sad/Angry folders containing WAV clips")
        return rows
    rows = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not {"path", "label"}.issubset(reader.fieldnames or []):
            raise ValueError("Manifest requires path,label headers; transcript is optional")
        for line, row in enumerate(reader, 2):
            label = (row.get("label") or "").strip()
            source = (row.get("path") or "").strip()
            if label not in BACKEND_LABELS or not source:
                raise ValueError(f"Manifest line {line}: require path and label in {BACKEND_LABELS}")
            audio_path = Path(source).expanduser()
            if not audio_path.is_absolute():
                audio_path = path.parent / audio_path
            if not audio_path.is_file():
                raise ValueError(f"Manifest line {line}: file not found: {audio_path}")
            rows.append({"path": str(audio_path.resolve()), "label": label,
                         "expected": ui_label(label),
                         "transcript": (row.get("transcript") or "").strip()})
    if not rows:
        raise ValueError("Manifest must contain at least one utterance")
    return rows


def select_balanced_sample(rows, samples_per_class):
    """Choose a deterministic, evenly spaced sample from each UI class."""
    selected = []
    for label in LABELS:
        group = [row for row in rows if row["expected"] == label]
        count = min(samples_per_class, len(group))
        if not count:
            continue
        if count == len(group):
            selected.extend(group)
            continue
        # Even spacing avoids always taking the first few filenames, which
        # can cluster on one speaker or statement in RAVDESS-style folders.
        indexes = [int((i + 0.5) * len(group) / count) for i in range(count)]
        selected.extend(group[index] for index in indexes)
    return selected


def build_report(records, pipeline):
    counts = {label: sum(r["expected"] == label for r in records) for label in LABELS}
    observed = [label for label in LABELS if counts[label]]
    metrics = {}
    for name in VARIANTS:
        correct = {label: sum(r["expected"] == label and
                              r["predictions"][name]["label"] == label for r in records)
                   for label in LABELS}
        recall = {label: correct[label] / counts[label] if counts[label] else None
                  for label in LABELS}
        metrics[name] = {"count": len(records), "class_counts": counts,
                         "per_class_recall": recall,
                         "macro_recall": sum(recall[label] for label in observed) / len(observed),
                         "accuracy": sum(correct.values()) / len(records)}
    baseline = metrics["baseline"]
    comparisons = {}
    for name in list(VARIANTS)[1:]:
        candidate = metrics[name]
        complete = len(observed) == len(LABELS)
        passes = (complete and candidate["macro_recall"] > baseline["macro_recall"]
                  and all(candidate["per_class_recall"][label] >
                          baseline["per_class_recall"][label] for label in ("Happy", "Sad"))
                  and all(candidate["per_class_recall"][label] >=
                          baseline["per_class_recall"][label] for label in LABELS))
        regressions = [
            {"path": r["path"], "expected": r["expected"],
             "baseline": r["predictions"]["baseline"]["label"],
             "candidate": r["predictions"][name]["label"]}
            for r in records if r["predictions"]["baseline"]["label"] == r["expected"]
            and r["predictions"][name]["label"] != r["expected"]
        ]
        comparisons[name] = {"passes_observed_gate": passes,
                             "regression_count": len(regressions), "regressions": regressions}
    return {
        "pipeline": pipeline, "evaluation_labels": LABELS,
        "label_mapping": {"Frustrated": "Angry"},
        "complete_coverage": len(observed) == len(LABELS),
        "missing_labels": [label for label in LABELS if not counts[label]],
        "macro_recall_scope": "observed classes only",
        "variants": {
            name: {"audio_boost": boost, "use_text_fallback": fallback,
                   "audio_classifier_blend": blend}
            for name, (boost, fallback, blend) in VARIANTS.items()
        },
        "metrics": metrics, "comparisons": comparisons,
        "candidate_only": [name for name, result in comparisons.items()
                           if result["passes_observed_gate"]],
        "gate_note": "Observed evidence only, not a general guarantee or automatic promotion. "
                     "Incomplete coverage is diagnostic only and cannot qualify a candidate.",
        "records": records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="CSV: path,label[,transcript], or labeled WAV folders")
    parser.add_argument("--pipeline", choices=("upload", "live"), default="upload")
    parser.add_argument("--samples-per-class", type=int, default=3,
                        help="Evenly sample this many clips per UI class (default: 3; 12 clips total)")
    parser.add_argument("--output", type=Path, help="Optional full JSON report file")
    args = parser.parse_args()
    try:
        if not 1 <= args.samples_per_class <= 10:
            raise ValueError("--samples-per-class must be between 1 and 10")
        rows = read_manifest(args.manifest.expanduser().resolve())
        rows = select_balanced_sample(rows, args.samples_per_class)
        if not rows:
            raise ValueError("No clips remain after balanced sampling")
        import sys
        sample_counts = {label: sum(row["expected"] == label for row in rows) for label in LABELS}
        print(f"Selected {len(rows)} clips: {sample_counts}", file=sys.stderr, flush=True)

        # Keep --help and manifest validation independent of inference dependencies.
        from config import DEVICE, FUSION_MODEL_CHECKPOINT, MAX_AUDIO_SAMPLES, SAMPLE_RATE, USE_MOCK_MODEL
        if USE_MOCK_MODEL:
            raise ValueError("Offline evaluation refuses USE_MOCK_MODEL; set it to false")
        from models import audio_utils, emotion_model, stt
        parameters = inspect.signature(emotion_model.predict).parameters
        if not {"audio_boost", "use_text_fallback", "audio_classifier_blend"}.issubset(parameters):
            raise ValueError("emotion_model.predict must support audio fusion comparison options")
        if emotion_model.is_mock() or stt.is_mock():
            raise ValueError("Offline evaluation refuses mock models")
        emotion_model.load_model(FUSION_MODEL_CHECKPOINT, device=DEVICE)
        if any(not row["transcript"] for row in rows):
            stt.load_model()
        if emotion_model.is_mock() or stt.is_mock():
            raise ValueError("Offline evaluation refuses mock models")

        records = []
        for row in rows:
            print(f"Evaluating {row['label']}: {Path(row['path']).name}", file=sys.stderr, flush=True)
            path = Path(row["path"])
            wav_bytes = audio_utils.to_wav_pcm16(path.read_bytes(), source_format=None)
            original = audio_utils.bytes_to_full_waveform(wav_bytes)
            samples = original.shape[0]
            if not 0 < samples <= MAX_AUDIO_SAMPLES:
                raise ValueError(f"{path}: duration {samples / SAMPLE_RATE:.6f}s; "
                                 "require a nonempty single utterance <=8s (no truncation)")
            transcript = row["transcript"] or stt.transcribe(wav_bytes)
            raw = audio_utils.pad_or_truncate(original.clone())
            if args.pipeline == "upload":
                processed = audio_utils.pad_or_truncate(audio_utils.enhance_audio(original.clone()))
            else:
                processed = audio_utils.enhance_audio(audio_utils.noise_gate(raw.clone(), threshold=0.01))
            predictions = {}
            for name, (boost, fallback, blend) in VARIANTS.items():
                waveform = raw if name.startswith("raw_") or name == "audio_focused" else processed
                result = emotion_model.predict(waveform.clone(), transcript,
                                               audio_boost=boost, use_text_fallback=fallback,
                                               audio_classifier_blend=blend)
                if result.get("mock"):
                    raise ValueError("Offline evaluation refuses mock predictions")
                if result["top_label"] not in BACKEND_LABELS:
                    raise ValueError(f"Unknown predicted label: {result['top_label']}")
                scores = result["probs"]
                predictions[name] = {
                    "label": ui_label(result["top_label"]),
                    "backend_label": result["top_label"], "backend_scores": scores,
                    "scores": {label: float(scores[label]) +
                               (float(scores["Frustrated"]) if label == "Angry" else 0.0)
                               for label in LABELS},
                }
            records.append({**row, "transcript": transcript,
                            "transcript_source": "manifest" if row["transcript"] else "stt",
                            "duration_seconds": samples / SAMPLE_RATE, "predictions": predictions})
        report = build_report(records, args.pipeline)
        text = json.dumps(report, indent=2, allow_nan=False)
        if args.output:
            args.output.write_text(text + "\n", encoding="utf-8")
        print(text)
    except (OSError, ValueError, RuntimeError) as exc:
        parser.exit(1, f"Evaluation failed: {exc}\n")


if __name__ == "__main__":
    main()

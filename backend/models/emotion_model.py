"""
emotion_model.py
────────────────
Emotion2Vec Large (via FunASR) + EmoBERTa-large fusion model with
Attention-Gating, adapted from the team's training code.

Two functions the backend actually calls:

    load_model(checkpoint_path)   — call once at startup
    predict(waveform, text)       — call per audio chunk / uploaded file

IMPORTANT: this architecture must match the team's model.py exactly.
"""
from typing import List
import logging
import re
import numpy as np
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

from config import (
    ANGRY_LOGIT_ADJUSTMENT,
    AUDIO_MODALITY_BOOST,
    EMOTION2VEC_CLASSIFIER_BLEND,
    FRUSTRATED_LOGIT_ADJUSTMENT,
    NEUTRAL_LOGIT_ADJUSTMENT,
    USE_TEXT_EMOTION_FALLBACK,
)

# ── must match model.py exactly ─────────────────────────────────────────────
AUDIO_MODEL_NAME: str = "iic/emotion2vec_plus_large"
TEXT_MODEL_NAME: str = "tae898/emoberta-large"
NUM_LABELS: int = 5

# Matches preprocess.py's LABEL_MAP order: neu=0, hap=1, sad=2, ang=3, fru=4
LABEL_NAMES = ["Neutral", "Happy", "Sad", "Angry", "Frustrated"]

# Matches dataset.py's fixed audio length (8 seconds @ 16kHz)
TARGET_SR = 16_000
MAX_AUDIO_SECS = 8
MAX_AUDIO_SAMPLES = TARGET_SR * MAX_AUDIO_SECS
MIN_AUDIO_SAMPLES = 8000
MAX_TEXT_LEN = 192


class FusionEmotionModel(nn.Module):
    """Copied from model.py — do not edit independently of that file.
    Late-fusion emotion classifier (Emotion2Vec Large via FunASR + EmoBERTa)
    with Attention-Gating."""

    def __init__(
        self,
        num_classes: int = NUM_LABELS,
        dropout: float = 0.3,
        device: str = "cpu",
        audio_pipeline=None,
    ):
        super().__init__()
        self.num_classes = num_classes

        print("Loading emotion2vec_plus_large via FunASR...")
        from funasr import AutoModel as FunASRAutoModel
        funasr_pipeline = audio_pipeline or FunASRAutoModel(
            model=AUDIO_MODEL_NAME, device=device
        )
        self.audio_encoders = nn.ModuleList([funasr_pipeline.model])

        print("Loading EmoBERTa-large...")
        self.text_encoder = AutoModel.from_pretrained(TEXT_MODEL_NAME)
        if hasattr(self.text_encoder, "gradient_checkpointing_enable"):
            self.text_encoder.gradient_checkpointing_enable()

        audio_dim = 1024
        text_dim = 1024
        fused_dim = (audio_dim * 2) + text_dim + 2

        self.modality_judge = nn.Sequential(
            nn.Linear(fused_dim, 2),
            nn.Softmax(dim=-1),
        )

        self.classifier = nn.Sequential(
            nn.LayerNorm(fused_dim),
            nn.Dropout(dropout),
            nn.Linear(fused_dim, 512),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(512, num_classes),
        )

        self._freeze_all()

    def _freeze_all(self):
        for enc in self.audio_encoders:
            for p in enc.parameters():
                p.requires_grad = False
        for p in self.text_encoder.parameters():
            p.requires_grad = False

    def forward(
        self,
        audio_values,
        input_ids,
        attention_mask,
        rms_energies,
        intensities,
        return_trust: bool = False,
        audio_boost: float = AUDIO_MODALITY_BOOST,
    ):
        audio_feats = []
        for enc in self.audio_encoders:
            out = enc.extract_features(audio_values, padding_mask=None)

            if isinstance(out, tuple):
                feats = out[0]
            elif isinstance(out, dict):
                if "x" in out:
                    feats = out["x"]
                elif "last_hidden_state" in out:
                    feats = out["last_hidden_state"]
                elif "feats" in out:
                    feats = out["feats"]
                else:
                    feats = list(out.values())[0]
            elif torch.is_tensor(out):
                feats = out
            else:
                feats = out

            feat_mean = feats.mean(dim=1)
            feat_max = feats.max(dim=1).values
            audio_feats.extend([feat_mean, feat_max])

        text_out = self.text_encoder(
            input_ids=input_ids, attention_mask=attention_mask
        ).last_hidden_state
        text_feat = text_out[:, 0, :]

        extra_feats = torch.cat([rms_energies, intensities], dim=-1)
        raw_fused = torch.cat(audio_feats + [text_feat, extra_feats], dim=-1)

        trust_scores = self.modality_judge(raw_fused)

        # Boost audio weight: shift trust toward audio so tone/pitch matter more
        audio_weight = (trust_scores[:, 0] * audio_boost).unsqueeze(1)
        text_weight = trust_scores[:, 1].unsqueeze(1)
        # Re-normalize so weights sum to 1
        total = audio_weight + text_weight
        audio_weight = audio_weight / total
        text_weight = text_weight / total
        effective_weights = torch.cat([audio_weight, text_weight], dim=-1)

        weighted_audio = [feat * audio_weight for feat in audio_feats]
        weighted_text = text_feat * text_weight

        fused = torch.cat(weighted_audio + [weighted_text, extra_feats], dim=-1)
        logits = self.classifier(fused)

        if return_trust:
            # Also compute individual modality predictions
            with torch.no_grad():
                # Audio-only: zero out text features
                audio_only_fused = torch.cat(
                    [feat * 1.0 for feat in audio_feats] + [torch.zeros_like(text_feat), extra_feats], dim=-1
                )
                audio_logits = self.classifier(audio_only_fused)

                # Text-only: zero out audio features
                text_only_fused = torch.cat(
                    [torch.zeros_like(feat) for feat in audio_feats] + [text_feat, extra_feats], dim=-1
                )
                text_logits = self.classifier(text_only_fused)

            # Report the normalized weights used to form `fused`, including
            # the configured audio boost, rather than the raw gate scores.
            return logits, effective_weights, audio_logits, text_logits
        return logits


# ── inference-time state ────────────────────────────────────────────────────
_model: FusionEmotionModel | None = None
_audio_emotion_pipeline = None
_audio_proc = None
_text_tokenizer = None
_biases: torch.Tensor | None = None
_device = "cpu"
_mock_mode = False
_audio_classifier_warning_logged = False


# ── text-based emotion fallback (when model confidence < 40%) ─────────────
_TEXT_EMOTION_KEYWORDS = {
    "Happy": [
        "happy", "great", "good", "love", "amazing", "wonderful", "excited",
        "glad", "pleased", "fantastic", "awesome", "nice", "enjoy", "smile",
        "laugh", "fun", "best", "beautiful", "perfect", "thank", "grateful",
    ],
    "Sad": [
        "sad", "sorry", "unfortunately", "disappointed", "miss", "lost",
        "lonely", "depressed", "cry", "tears", "heartbroken", "regret",
        "painful", "hurt", "suffering", "grief", "unhappy", "miserable",
    ],
    "Angry": [
        "angry", "frustrated", "annoyed", "furious", "hate", "stupid",
        "ridiculous", "terrible", "awful", "horrible", "worst", "mad",
        "outraged", "infuriated", "livid", "disgusted", "fed up",
    ],
    "Frustrated": [
        "frustrated", "stuck", "confused", "complicated", "difficult",
        "struggling", "problem", "issue", "wrong", "broken", "fail",
        "failing", "impossible", "can't", "cannot", "giving up",
    ],
}


def _text_emotion_fallback(text: str):
    """Simple keyword-based emotion detection for text fallback."""
    if not text or not text.strip():
        return None

    text_lower = text.lower()
    scores = {emotion: 0 for emotion in _TEXT_EMOTION_KEYWORDS}

    for emotion, keywords in _TEXT_EMOTION_KEYWORDS.items():
        for kw in keywords:
            if re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", text_lower):
                scores[emotion] += 1

    # Return emotion with highest keyword matches, or None if no matches
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _build_inference_biases(checkpoint_biases, device: str) -> torch.Tensor:
    """Load checkpoint calibration and apply small requested class corrections."""
    if checkpoint_biases is None:
        # Preserve the model's existing manual calibration as the starting point.
        base = torch.tensor([-0.8, 0.2, 0.2, 0.35, 0.2], dtype=torch.float32)
    else:
        base = torch.as_tensor(checkpoint_biases, dtype=torch.float32)
        if base.shape != (NUM_LABELS,) or not torch.isfinite(base).all():
            raise ValueError("Checkpoint inference_biases must contain five finite values")

    adjustments = torch.tensor(
        [NEUTRAL_LOGIT_ADJUSTMENT, 0.0, 0.0,
         ANGRY_LOGIT_ADJUSTMENT, FRUSTRATED_LOGIT_ADJUSTMENT],
        dtype=torch.float32,
    )
    return (base + adjustments).to(device)


def _emotion2vec_ui_scores(result) -> tuple[np.ndarray, float] | None:
    """Map Emotion2Vec's multilingual labels onto the app's four UI emotions."""
    if not result:
        return None
    item = result[0] if isinstance(result, (list, tuple)) else result
    if not isinstance(item, dict):
        return None
    labels, scores = item.get("labels"), item.get("scores")
    if not isinstance(labels, (list, tuple)) or not isinstance(scores, (list, tuple)):
        return None
    if len(labels) != len(scores):
        return None

    aliases = {
        "Neutral": ("neutral", "中立"),
        "Happy": ("happy", "开心"),
        "Sad": ("sad", "难过"),
        "Angry": ("angry", "生气"),
    }
    mapped = {label: 0.0 for label in aliases}
    for raw_label, raw_score in zip(labels, scores):
        label = str(raw_label).lower()
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            continue
        if not np.isfinite(score) or score < 0:
            continue
        for emotion, names in aliases.items():
            if any(name in label for name in names):
                mapped[emotion] += score
                break

    coverage = float(sum(mapped.values()))
    if coverage <= 1e-8:
        return None
    probabilities = np.asarray(
        [mapped[emotion] / coverage for emotion in ("Neutral", "Happy", "Sad", "Angry")],
        dtype=np.float32,
    )
    return probabilities, min(coverage, 1.0)


def _calibrate_audio_ui_probs(audio_ui_probs: np.ndarray, biases: torch.Tensor) -> np.ndarray:
    bias_values = biases.detach().cpu().numpy()
    class_bias = np.asarray(
        [bias_values[0], bias_values[1], bias_values[2], bias_values[3]],
        dtype=np.float64,
    )
    logits = np.log(np.clip(np.asarray(audio_ui_probs, dtype=np.float64), 1e-8, 1.0))
    logits += class_bias
    logits -= logits.max()
    calibrated = np.exp(logits)
    return (calibrated / calibrated.sum()).astype(np.float32)


def _blend_audio_classifier(
    fused_probs: np.ndarray,
    audio_ui_probs: np.ndarray,
    coverage: float,
    configured_weight: float,
) -> tuple[np.ndarray, float]:
    """Blend the two audio-aware heads in four UI classes, with coverage gating."""
    if not np.isfinite(configured_weight) or not 0.0 <= configured_weight <= 1.0:
        raise ValueError("EMOTION2VEC_CLASSIFIER_BLEND must be between 0 and 1")
    if configured_weight == 0 or coverage <= 0:
        return fused_probs, 0.0

    # When Emotion2Vec assigns probability to its other/unknown categories, do
    # not let renormalization make its four recognized classes look certain.
    weight = configured_weight * min(coverage / 0.75, 1.0)
    fused_ui = np.asarray(
        [fused_probs[0], fused_probs[1], fused_probs[2], fused_probs[3] + fused_probs[4]],
        dtype=np.float64,
    )
    audio_ui = np.asarray(audio_ui_probs, dtype=np.float64)
    mixed = (1.0 - weight) * fused_ui + weight * audio_ui

    logits = np.log(np.clip(mixed, 1e-8, 1.0))
    logits -= logits.max()
    final_ui = np.exp(logits)
    final_ui /= final_ui.sum()

    # Preserve the fusion model's Angry/Frustrated split inside the merged UI
    # Angry category; Emotion2Vec has no separate Frustrated label.
    angry_total = fused_probs[3] + fused_probs[4]
    angry_share = float(fused_probs[3] / angry_total) if angry_total > 1e-8 else 1.0
    final = np.asarray(
        [final_ui[0], final_ui[1], final_ui[2], final_ui[3] * angry_share,
         final_ui[3] * (1.0 - angry_share)],
        dtype=np.float32,
    )
    return final, float(weight)


def load_model(checkpoint_path: str, device: str = "cpu"):
    """
    Loads your trained checkpoint (the .pt file finetune_iemocap.py saves).
    Call once at app startup.
    """
    global _model, _audio_emotion_pipeline, _audio_proc, _text_tokenizer
    global _biases, _device, _mock_mode
    _device = device
    _mock_mode = False

    # Custom audio processor: just pad-sequences waveforms into a batched tensor
    def audio_processor(waveforms, **kwargs):
        if isinstance(waveforms, list):
            tensors = [torch.as_tensor(w, dtype=torch.float32) for w in waveforms]
            audio_tensor = torch.nn.utils.rnn.pad_sequence(tensors, batch_first=True)
        else:
            audio_tensor = torch.as_tensor(waveforms, dtype=torch.float32)
        return {"input_values": audio_tensor}

    _audio_proc = audio_processor
    _text_tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL_NAME)
    from funasr import AutoModel as FunASRAutoModel
    _audio_emotion_pipeline = FunASRAutoModel(
        model=AUDIO_MODEL_NAME,
        device=device,
        disable_pbar=True,
        disable_update=True,
    )
    _model = FusionEmotionModel(
        num_classes=NUM_LABELS, device=device, audio_pipeline=_audio_emotion_pipeline
    )
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    inference_biases = None
    state = checkpoint

    if isinstance(checkpoint, dict):
        inference_biases = checkpoint.get("inference_biases")
        for key in ("model_state_dict", "state_dict"):
            if key in checkpoint and isinstance(checkpoint[key], dict):
                state = checkpoint[key]
                break
    elif isinstance(state, nn.Module):
        state = state.state_dict()

    _model.load_state_dict(state)
    _model.to(device)
    _model.eval()

    # Start from checkpoint or legacy calibration, then apply small configured
    # reductions to Neutral, Angry, and Frustrated logits.
    # Order: [Neutral, Happy, Sad, Angry, Frustrated]
    _biases = _build_inference_biases(inference_biases, _device)


def enable_mock_mode():
    """
    Serve randomised predictions in the real response shape.
    Used when no trained checkpoint is available yet.
    """
    global _mock_mode
    _mock_mode = True


def is_loaded() -> bool:
    return _model is not None


def is_mock() -> bool:
    return _mock_mode


def _mock_predict() -> dict:
    import random

    weights = [random.random() for _ in LABEL_NAMES]
    total = sum(weights)
    prob_dict = {label: w / total for label, w in zip(LABEL_NAMES, weights)}
    top_label = max(prob_dict, key=prob_dict.get)

    audio_w = random.uniform(0.35, 0.75)
    return {
        "probs": prob_dict,
        "top_label": top_label,
        "confidence": prob_dict[top_label],
        "modality_weights": {"audio": audio_w, "text": 1.0 - audio_w},
        "mock": True,
    }


def predict(
    waveform,
    text: str,
    *,
    audio_boost: float | None = None,
    use_text_fallback: bool | None = None,
    audio_classifier_blend: float | None = None,
) -> dict:
    """
    waveform: 1D torch.Tensor or numpy array, 16kHz mono, already
              pad/truncated to MAX_AUDIO_SAMPLES (see audio_utils.py)
    text:     transcript string (from Whisper)

    Returns:
      {
        "probs": {label: float},
        "top_label": str,
        "confidence": float,
        "modality_weights": {"audio": float, "text": float},
      }
    """
    global _audio_classifier_warning_logged
    if _mock_mode:
        return _mock_predict()

    audio_boost = AUDIO_MODALITY_BOOST if audio_boost is None else audio_boost
    use_text_fallback = (
        USE_TEXT_EMOTION_FALLBACK if use_text_fallback is None else use_text_fallback
    )
    audio_classifier_blend = (
        EMOTION2VEC_CLASSIFIER_BLEND
        if audio_classifier_blend is None
        else audio_classifier_blend
    )
    if not np.isfinite(audio_classifier_blend) or not 0.0 <= audio_classifier_blend <= 1.0:
        raise ValueError("audio_classifier_blend must be between 0 and 1")

    if not np.isfinite(audio_boost) or audio_boost <= 0:
        raise ValueError("audio_boost must be a positive finite number")

    if _model is None:
        raise RuntimeError("Model not loaded — call load_model() at startup")

    if not torch.is_tensor(waveform):
        waveform = torch.tensor(waveform, dtype=torch.float32)
    waveform = waveform.to(torch.float32)

    # Pad to minimum length if needed
    if waveform.shape[0] < MIN_AUDIO_SAMPLES:
        waveform = torch.nn.functional.pad(
            waveform, (0, MIN_AUDIO_SAMPLES - waveform.shape[0])
        )

    # Acoustic features (same as dataset.py)
    rms_energy = torch.sqrt(torch.mean(waveform ** 2)).view(1, 1)
    intensity = torch.max(torch.abs(waveform)).view(1, 1)

    # Audio inputs via the custom pad-sequence processor
    audio_inputs = _audio_proc(
        [waveform.detach().cpu().numpy()], sampling_rate=TARGET_SR, return_tensors="pt",
        padding=True, truncation=True, max_length=MAX_AUDIO_SAMPLES
    )
    audio_values = audio_inputs["input_values"]
    if audio_values.ndim == 3 and audio_values.shape[1] == 1:
        audio_values = audio_values.squeeze(1)

    # Text inputs via emoberta-large tokenizer
    text_inputs = _text_tokenizer(
        [text or ""], padding=True, truncation=True,
        max_length=MAX_TEXT_LEN, return_tensors="pt"
    )

    audio_values = audio_values.to(_device)
    input_ids = text_inputs["input_ids"].to(_device)
    attention_mask = text_inputs["attention_mask"].to(_device)
    rms_energy = rms_energy.to(_device)
    intensity = intensity.to(_device)

    with torch.no_grad():
        logits, trust_scores, audio_logits, text_logits = _model(
            audio_values,
            input_ids,
            attention_mask,
            rms_energy,
            intensity,
            return_trust=True,
            audio_boost=audio_boost,
        )

        # Apply inference biases if present
        if _biases is not None:
            logits = logits + _biases
            audio_logits = audio_logits + _biases
            text_logits = text_logits + _biases

        probs = torch.softmax(logits, dim=-1).squeeze().cpu().numpy()
        audio_probs = torch.softmax(audio_logits, dim=-1).squeeze().cpu().numpy()
        text_probs = torch.softmax(text_logits, dim=-1).squeeze().cpu().numpy()
        trust = trust_scores.squeeze().cpu().numpy()

        native_audio_probs = None
        coverage = 0.0
        if _audio_emotion_pipeline is not None and audio_classifier_blend > 0:
            try:
                native_result = _audio_emotion_pipeline.generate(
                    waveform.detach().cpu().numpy().astype(np.float32, copy=False),
                    fs=TARGET_SR,
                    granularity="utterance",
                    extract_embedding=False,
                )
                parsed = _emotion2vec_ui_scores(native_result)
                if parsed is not None:
                    native_audio_probs, coverage = parsed
                    native_audio_probs = _calibrate_audio_ui_probs(native_audio_probs, _biases)
            except Exception:
                if not _audio_classifier_warning_logged:
                    logging.getLogger(__name__).exception(
                        "Emotion2Vec audio classification failed; using fusion prediction only"
                    )
                    _audio_classifier_warning_logged = True

        # If top prediction confidence < 40%, model is uncertain — try text-based fallback
        max_prob = float(probs.max())
        if use_text_fallback and max_prob < 0.40:
            text_emotion = _text_emotion_fallback(text)
            if text_emotion is not None:
                idx = LABEL_NAMES.index(text_emotion)
                probs = np.zeros(NUM_LABELS, dtype=np.float32)
                probs[idx] = 0.5
                # distribute remaining probability evenly
                remainder = 0.5 / (NUM_LABELS - 1)
                for i in range(NUM_LABELS):
                    if i != idx:
                        probs[i] = remainder

        audio_classifier_weight = 0.0
        if native_audio_probs is not None:
            probs, audio_classifier_weight = _blend_audio_classifier(
                probs,
                native_audio_probs,
                coverage,
                audio_classifier_blend,
            )
            # Expose Emotion2Vec's dedicated pretrained head as the audio result.
            native_five = np.asarray(
                [native_audio_probs[0], native_audio_probs[1], native_audio_probs[2],
                 native_audio_probs[3], 0.0],
                dtype=np.float32,
            )
            audio_probs = native_five / max(float(native_five.sum()), 1e-8)

    prob_dict = {label: float(p) for label, p in zip(LABEL_NAMES, probs)}
    top_label = max(prob_dict, key=prob_dict.get)

    audio_prob_dict = {label: float(p) for label, p in zip(LABEL_NAMES, audio_probs)}
    audio_top = max(audio_prob_dict, key=audio_prob_dict.get)

    text_prob_dict = {label: float(p) for label, p in zip(LABEL_NAMES, text_probs)}
    text_top = max(text_prob_dict, key=text_prob_dict.get)

    return {
        "probs": prob_dict,
        "top_label": top_label,
        "confidence": prob_dict[top_label],
        "modality_weights": {"audio": float(trust[0]), "text": float(trust[1])},
        "audio_emotion": {"label": audio_top, "confidence": audio_prob_dict[audio_top]},
        "text_emotion": {"label": text_top, "confidence": text_prob_dict[text_top]},
        "audio_classifier_weight": audio_classifier_weight,
    }

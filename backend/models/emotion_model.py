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
import numpy as np
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

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

    def __init__(self, num_classes: int = NUM_LABELS, dropout: float = 0.3):
        super().__init__()
        self.num_classes = num_classes

        print("Loading emotion2vec_plus_large via FunASR...")
        import os
        from funasr import AutoModel as FunASRAutoModel
        _emotion2vec_cache = os.path.expanduser(
            "~/.cache/modelscope/hub/iic/emotion2vec_plus_large"
        )
        funasr_pipeline = FunASRAutoModel(
            model=_emotion2vec_cache, disable_update=True, device="cpu"
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
        audio_weight = trust_scores[:, 0].unsqueeze(1)
        text_weight = trust_scores[:, 1].unsqueeze(1)

        weighted_audio = [feat * audio_weight for feat in audio_feats]
        weighted_text = text_feat * text_weight

        fused = torch.cat(weighted_audio + [weighted_text, extra_feats], dim=-1)
        logits = self.classifier(fused)

        if return_trust:
            return logits, trust_scores
        return logits


# ── inference-time state ────────────────────────────────────────────────────
_model: FusionEmotionModel | None = None
_audio_proc = None
_text_tokenizer = None
_biases: torch.Tensor | None = None
_device = "cpu"
_mock_mode = False


def load_model(checkpoint_path: str, device: str = "cpu"):
    """
    Loads your trained checkpoint (the .pt file finetune_iemocap.py saves).
    Call once at app startup.
    """
    global _model, _audio_proc, _text_tokenizer, _biases, _device, _mock_mode
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

    _model = FusionEmotionModel(num_classes=NUM_LABELS)
    state = torch.load(checkpoint_path, map_location=device, weights_only=True)

    if isinstance(state, dict):
        for key in ("model_state_dict", "state_dict"):
            if key in state and isinstance(state[key], dict):
                state = state[key]
                break
    elif isinstance(state, nn.Module):
        state = state.state_dict()

    _model.load_state_dict(state)
    _model.to(device)
    _model.eval()

    # Default inference biases (zeros); overwritten by eval_opt.py offsets
    # if present in the checkpoint
    _biases = torch.zeros(NUM_LABELS, device=_device, dtype=torch.float32)
    if isinstance(state, dict) and "inference_biases" in state:
        _biases = torch.tensor(
            state["inference_biases"], device=_device, dtype=torch.float32
        )


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


def predict(waveform, text: str) -> dict:
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
    if _mock_mode:
        return _mock_predict()

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
        [waveform.numpy()], sampling_rate=TARGET_SR, return_tensors="pt",
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
        logits, trust_scores = _model(
            audio_values,
            input_ids,
            attention_mask,
            rms_energy,
            intensity,
            return_trust=True,
        )

        # Apply inference biases if present
        if _biases is not None:
            logits = logits + _biases

        probs = torch.softmax(logits, dim=-1).squeeze().cpu().numpy()
        trust = trust_scores.squeeze().cpu().numpy()

    prob_dict = {label: float(p) for label, p in zip(LABEL_NAMES, probs)}
    top_label = max(prob_dict, key=prob_dict.get)

    return {
        "probs": prob_dict,
        "top_label": top_label,
        "confidence": prob_dict[top_label],
        "modality_weights": {"audio": float(trust[0]), "text": float(trust[1])},
    }

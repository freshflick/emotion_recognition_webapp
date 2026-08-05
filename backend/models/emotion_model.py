"""
emotion_model.py
────────────────
This is YOUR model — the FusionEmotionModel architecture copied verbatim
from your team's model.py, plus two functions the backend actually calls:

    load_model(checkpoint_path)   — call once at startup
    predict(waveform, text)       — call per audio chunk / uploaded file

IMPORTANT: this architecture must always match whatever model.py your
team is training with. If someone changes model.py during training
experiments (e.g. adds a feature, changes a layer), this file needs the
same edit or `model.load_state_dict()` will fail with a shape mismatch.
The safest long-term fix is to turn your training repo into an installable
package and import FusionEmotionModel from it directly instead of
duplicating the class here — worth doing once your architecture stabilizes.
"""
from typing import List
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer, AutoFeatureExtractor

# ── must match model.py exactly ─────────────────────────────────────────────
AUDIO_MODEL_NAMES: List[str] = ["microsoft/wavlm-large"]
TEXT_MODEL_NAME: str = "tae898/emoberta-base"
NUM_LABELS: int = 4

# Matches preprocess.py's LABEL_MAP order: neu=0, hap=1(+exc), sad=2, ang=3
LABEL_NAMES = ["Neutral", "Happy", "Sad", "Angry"]

# Matches dataset.py's fixed audio length (8 seconds @ 16kHz)
TARGET_SR = 16_000
MAX_AUDIO_SECS = 8
MAX_AUDIO_SAMPLES = TARGET_SR * MAX_AUDIO_SECS
MAX_TEXT_LEN = 128


class FusionEmotionModel(nn.Module):
    """Copied from model.py — do not edit independently of that file."""

    def __init__(
        self,
        audio_model_names: List[str] = AUDIO_MODEL_NAMES,
        text_model_name: str = TEXT_MODEL_NAME,
        num_labels: int = NUM_LABELS,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.audio_model_names = audio_model_names
        self.text_model_name = text_model_name
        self.num_labels = num_labels

        self.audio_encoders = nn.ModuleList(
            [AutoModel.from_pretrained(name) for name in audio_model_names]
        )
        self.text_encoder = AutoModel.from_pretrained(text_model_name)

        self.audio_dims = [enc.config.hidden_size for enc in self.audio_encoders]
        self.text_dim = self.text_encoder.config.hidden_size

        fused_dim = (sum(self.audio_dims) * 2) + self.text_dim + 2

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
            nn.Linear(512, num_labels),
        )

    def forward(
        self,
        audio_values,
        input_ids,
        attention_mask,
        rms_energies,
        intensities,
        return_trust: bool = False,
    ):
        # `return_trust` is inference-only sugar — it adds no parameters, so
        # checkpoints stay loadable and training behaviour is unchanged. It
        # surfaces the modality_judge scores the API reports to the UI.
        audio_feats = []
        for enc in self.audio_encoders:
            out = enc(audio_values, output_hidden_states=True)
            all_layers = out.hidden_states
            multi_scale_feat = torch.stack(all_layers[-4:]).mean(dim=0)
            feat_mean = multi_scale_feat.mean(dim=1)
            feat_max = multi_scale_feat.max(dim=1).values
            audio_feats.append(feat_mean)
            audio_feats.append(feat_max)

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
_audio_processor = None
_text_tokenizer = None
_device = "cpu"
_mock_mode = False


def load_model(checkpoint_path: str, device: str = "cpu"):
    """
    Loads your trained checkpoint (the .pt file train.py saves to
    outputs/models/fusion_model.pt). Call once at app startup.

    train.py may have saved either a bare state_dict or a wrapper dict with
    the weights under "model_state_dict"/"state_dict" — both are accepted, so
    you don't have to re-export the checkpoint to match one convention.
    """
    global _model, _audio_processor, _text_tokenizer, _device, _mock_mode
    _device = device
    _mock_mode = False

    _audio_processor = AutoFeatureExtractor.from_pretrained(AUDIO_MODEL_NAMES[0])
    _text_tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL_NAME)

    _model = FusionEmotionModel()
    state = torch.load(checkpoint_path, map_location=device, weights_only=False)

    if isinstance(state, dict):
        for key in ("model_state_dict", "state_dict"):
            if key in state and isinstance(state[key], dict):
                state = state[key]
                break
    elif isinstance(state, nn.Module):
        # Checkpoint was saved with torch.save(model) rather than the
        # state_dict — pull the weights back out.
        state = state.state_dict()

    _model.load_state_dict(state)
    _model.to(device)
    _model.eval()


def enable_mock_mode():
    """
    Serve randomised predictions in the real response shape.

    Used when no trained checkpoint is available yet, so the frontend, the
    WebSocket protocol and persistence can all be built and demoed end-to-end
    before training finishes. Responses carry "mock": true so the UI can badge
    them and nobody mistakes them for real results.
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
              pad/truncated to MAX_AUDIO_SAMPLES (see audio_utils.py —
              use the same fixed-length logic as dataset.py's _load_audio
              so inference matches the distribution the model was trained on)
    text:     transcript string (from Whisper)

    Returns:
      {
        "probs": {label: float},
        "top_label": str,
        "confidence": float,
        "modality_weights": {"audio": float, "text": float},
      }

    `modality_weights` is the modality_judge softmax — the model's learned,
    per-utterance answer to "how far do I trust the voice vs the words here?".
    The UI shows these instead of a hardcoded audio/text split. Note this is a
    trust weighting, NOT a per-modality emotion prediction: the architecture
    has a single classifier over the fused vector, so an audio-only or
    text-only emotion label is not something this model can produce.
    """
    if _mock_mode:
        return _mock_predict()

    if _model is None:
        raise RuntimeError("Model not loaded — call load_model() at startup")

    if not torch.is_tensor(waveform):
        waveform = torch.tensor(waveform, dtype=torch.float32)
    waveform = waveform.to(torch.float32)

    # Same acoustic features as dataset.py's __getitem__
    rms_energy = torch.sqrt(torch.mean(waveform ** 2)).view(1, 1)
    intensity = torch.max(torch.abs(waveform)).view(1, 1)

    audio_inputs = _audio_processor(
        [waveform.numpy()], sampling_rate=TARGET_SR, return_tensors="pt", padding=True
    )
    audio_values = audio_inputs["input_values"]
    if audio_values.ndim == 3 and audio_values.shape[1] == 1:
        audio_values = audio_values.squeeze(1)

    text_inputs = _text_tokenizer(
        [text or ""], padding=True, truncation=True, max_length=MAX_TEXT_LEN, return_tensors="pt"
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

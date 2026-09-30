"""Online speaker identification for a single-microphone live session."""

import os
import threading

import torch
import torch.nn.functional as F

from config import DEVICE, SPEAKER_MODEL_NAME, SUBJECT_MATCH_SIMILARITY

_encoder = None
_encoder_lock = threading.Lock()
_inference_lock = threading.Lock()


def _get_encoder():
    global _encoder
    if _encoder is None:
        with _encoder_lock:
            if _encoder is None:
                from speechbrain.inference.speaker import EncoderClassifier

                cache_dir = os.path.expanduser("~/.cache/speechbrain/spkrec-ecapa-voxceleb")
                _encoder = EncoderClassifier.from_hparams(
                    source=SPEAKER_MODEL_NAME,
                    savedir=cache_dir,
                    run_opts={"device": DEVICE},
                )
    return _encoder


class OnlineSpeakerDiarizer:
    """Assign stable session-local speaker labels using ECAPA embeddings."""

    def __init__(self, expected_speakers: int, force_enrollment: bool = False):
        self.expected_speakers = max(1, min(int(expected_speakers), 4))
        self.centroids: list[torch.Tensor | None] = [None] * self.expected_speakers
        self.last_speaker = 0
        # A one-speaker live session has nobody to tell apart, so it skips ECAPA
        # entirely. Uploaded conversations are different: a single enrolled
        # profile there means "is this the subject?", which does need a real
        # embedding, so force_enrollment turns the shortcut back off.
        self.force_enrollment = force_enrollment

    @property
    def _skip_speaker_matching(self) -> bool:
        return self.expected_speakers == 1 and not self.force_enrollment

    def prepare(self) -> None:
        if self.expected_speakers > 1 or self.force_enrollment:
            _get_encoder()

    @property
    def is_ready(self) -> bool:
        return self._skip_speaker_matching or all(
            centroid is not None for centroid in self.centroids
        )

    def _embed(self, waveform: torch.Tensor) -> torch.Tensor:
        signal = waveform.detach().to(torch.float32).flatten()
        if signal.numel() < 16_000:
            raise ValueError("Speaker sample must contain at least one second of audio")

        peak = signal.abs().max()
        if peak <= 0.005:
            raise ValueError("Speaker sample is too quiet")
        signal = signal / peak

        encoder = _get_encoder()
        device = torch.device(DEVICE)
        signal = signal.unsqueeze(0).to(device)
        lengths = torch.ones(1, device=device)

        with _inference_lock, torch.no_grad():
            embedding = encoder.encode_batch(signal, lengths).squeeze().cpu()
        return F.normalize(embedding, dim=0)

    def enroll(self, speaker_index: int, waveform: torch.Tensor) -> float:
        if self._skip_speaker_matching:
            return 1.0
        if not 0 <= speaker_index < self.expected_speakers:
            raise ValueError("Invalid speaker number")
        if waveform.numel() < 16_000 * 3:
            raise ValueError("Record at least three seconds for speaker enrollment")

        embedding = self._embed(waveform)
        other_centroids = [
            centroid
            for index, centroid in enumerate(self.centroids)
            if index != speaker_index and centroid is not None
        ]
        if other_centroids:
            closest = max(
                float(F.cosine_similarity(embedding, centroid, dim=0))
                for centroid in other_centroids
            )
            if closest > 0.82:
                raise ValueError(
                    "This voice is too similar to an enrolled speaker. "
                    "Make sure a different person records this sample."
                )

        self.centroids[speaker_index] = embedding
        return 1.0

    def _similarities(self, waveform: torch.Tensor) -> torch.Tensor:
        """Cosine similarity of one utterance against every enrolled profile."""
        embedding = self._embed(waveform)
        return torch.tensor(
            [
                float(F.cosine_similarity(embedding, centroid, dim=0))
                for centroid in self.centroids
                if centroid is not None
            ]
        )

    def _match(self, similarities: torch.Tensor) -> tuple[str, float]:
        """Pick the closest profile and score how clearly it wins."""
        best_index = int(similarities.argmax())
        best_similarity = float(similarities[best_index])

        self.last_speaker = best_index
        if similarities.numel() > 1:
            second_similarity = float(similarities.topk(2).values[1])
            margin = best_similarity - second_similarity
            # Confidence reflects separation from the next-best enrolled
            # profile, not merely raw cosine similarity.
            confidence = max(0.0, min(1.0, (margin + 0.2) / 0.6))
        else:
            confidence = max(0.0, min(1.0, (best_similarity + 1.0) / 2.0))
        return f"Speaker {best_index + 1}", confidence

    def identify(self, waveform: torch.Tensor) -> tuple[str, float]:
        if self._skip_speaker_matching:
            return "Speaker 1", 1.0

        if not self.is_ready:
            raise RuntimeError("All expected speakers must be enrolled first")

        # Speaker embeddings become unstable on very short utterances. Keep the
        # previous identity rather than inventing a new speaker for a short word.
        if waveform.numel() < 16_000:
            return f"Speaker {self.last_speaker + 1}", 0.5

        return self._match(self._similarities(waveform))

    def is_subject(self, waveform: torch.Tensor) -> tuple[bool, float]:
        """Is this audio the enrolled subject?

        Unlike `identify`, this always runs ECAPA, even when only one profile is
        enrolled. `identify` short-circuits to "Speaker 1" for a single-speaker
        session because there is nothing to choose between; here the whole point
        is to decide whether a chunk belongs to the subject at all, which is how
        uploaded conversations are filtered down to one person.
        """
        if not self.is_ready:
            raise RuntimeError("The subject must be enrolled first")

        # Too short to embed reliably. Assume it belongs to the subject so a
        # quiet word is not silently dropped from their emotion timeline.
        if waveform.numel() < 16_000:
            return True, 0.5

        similarities = self._similarities(waveform)
        similarity = float(similarities[0])
        return similarity >= SUBJECT_MATCH_SIMILARITY, similarity

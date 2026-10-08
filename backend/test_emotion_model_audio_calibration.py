"""Unit checks for the audio-focused inference calibration."""
import unittest

import numpy as np
import torch

from models.emotion_model import (
    _blend_audio_classifier,
    _build_inference_biases,
    _calibrate_audio_ui_probs,
    _emotion2vec_ui_scores,
)


class AudioCalibrationTests(unittest.TestCase):
    def test_small_neutral_and_anger_adjustments_apply_to_checkpoint_biases(self):
        biases = _build_inference_biases([0.0] * 5, "cpu")
        self.assertTrue(torch.allclose(
            biases,
            torch.tensor([-0.15, 0.0, 0.0, -0.25, -0.10]),
            atol=1e-6,
        ))

    def test_adjustments_lower_neutral_and_merged_angry_probability(self):
        previous = torch.tensor([-0.8, 0.2, 0.2, 0.35, 0.2])
        biases = _build_inference_biases(None, "cpu")
        previous_probs = _calibrate_audio_ui_probs(np.full(4, 0.25), previous)
        adjusted = _calibrate_audio_ui_probs(np.full(4, 0.25), biases)
        self.assertLess(float(adjusted[0]), float(previous_probs[0]))
        self.assertLess(float(adjusted[3]), float(previous_probs[3]))
        self.assertAlmostEqual(float(adjusted.sum()), 1.0, places=6)

    def test_emotion2vec_scores_map_to_the_four_supported_ui_classes(self):
        mapped = _emotion2vec_ui_scores({
            "labels": ["中立/neutral", "开心/happy", "难过/sad", "生气/angry", "other"],
            "scores": [0.2, 0.4, 0.1, 0.2, 0.1],
        })
        self.assertIsNotNone(mapped)
        probs, coverage = mapped
        self.assertAlmostEqual(coverage, 0.9)
        self.assertTrue(np.allclose(probs, [2 / 9, 4 / 9, 1 / 9, 2 / 9]))

    def test_unknown_emotion_mass_reduces_the_audio_head_blend(self):
        fused = np.asarray([0.25, 0.25, 0.25, 0.15, 0.10], dtype=np.float32)
        audio = np.asarray([0.1, 0.5, 0.2, 0.2], dtype=np.float32)
        final, weight = _blend_audio_classifier(
            fused, audio, 0.375, 0.40
        )
        self.assertAlmostEqual(weight, 0.20)
        self.assertAlmostEqual(float(final.sum()), 1.0, places=6)

    def test_confident_audio_sad_prediction_overrides_loudness_biased_angry_fusion(self):
        fused = np.asarray([0.01, 0.01, 0.01, 0.97, 0.0], dtype=np.float32)
        audio_sad = np.asarray([0.0, 0.0, 1.0, 0.0], dtype=np.float32)
        final, weight = _blend_audio_classifier(fused, audio_sad, 1.0, 0.8)
        self.assertAlmostEqual(weight, 0.8)
        self.assertGreater(float(final[2]), float(final[3] + final[4]))


if __name__ == "__main__":
    unittest.main()

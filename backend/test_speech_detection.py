"""Run from backend/: python -m unittest test_speech_detection."""
import unittest

import numpy as np

from models.stt import has_speech


class SpeechDetectionTests(unittest.TestCase):
    def test_ten_seconds_of_silence(self):
        self.assertFalse(has_speech(np.zeros(160_000, dtype=np.float32)))

    def test_short_silent_clip(self):
        self.assertFalse(has_speech(np.zeros(16_000, dtype=np.float32)))

    def test_empty_audio(self):
        self.assertFalse(has_speech(np.array([], dtype=np.float32)))

    def test_invalid_samples(self):
        self.assertFalse(has_speech(np.array([np.nan], dtype=np.float32)))


if __name__ == "__main__":
    unittest.main()

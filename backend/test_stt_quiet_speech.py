"""Quiet speech must reach Whisper rather than being rejected by RMS alone."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from models.audio_utils import wrap_pcm16_as_wav
from models import stt


class QuietSpeechTests(unittest.TestCase):
    def test_low_pcm_level_is_not_rejected_before_whisper_vad(self):
        class FakeWhisper:
            called = False

            def transcribe(self, _path, **_kwargs):
                self.called = True
                segment = SimpleNamespace(
                    no_speech_prob=0.0,
                    avg_logprob=-0.2,
                    compression_ratio=1.0,
                    words=[],
                    text="I feel sad",
                )
                return [segment], SimpleNamespace()

        # RMS 20 is below the former 100-count cutoff.
        quiet_pcm = np.full(16_000, 20, dtype=np.int16).tobytes()
        fake = FakeWhisper()
        with patch.object(stt, "_model", fake), patch.object(stt, "_mock_mode", False):
            transcript = stt.transcribe(wrap_pcm16_as_wav(quiet_pcm))

        self.assertEqual(transcript, "I feel sad")
        self.assertTrue(fake.called)


if __name__ == "__main__":
    unittest.main()

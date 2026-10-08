"""Checks that the optional text fallback matches whole words and phrases."""
import unittest

from models.emotion_model import _text_emotion_fallback


class TextFallbackBoundaryTests(unittest.TestCase):
    def test_substrings_do_not_create_emotion_matches(self):
        self.assertIsNone(_text_emotion_fallback("goodbye"))
        self.assertIsNone(_text_emotion_fallback("missile"))

    def test_complete_keywords_still_match(self):
        self.assertEqual(_text_emotion_fallback("I feel happy today"), "Happy")
        self.assertEqual(_text_emotion_fallback("I am fed up"), "Angry")


if __name__ == "__main__":
    unittest.main()

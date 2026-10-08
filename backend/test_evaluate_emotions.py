"""Fast, model-free checks for the bounded evaluation sample selector."""
import unittest

from evaluate_emotions import LABELS, select_balanced_sample, ui_label


class BalancedSampleTests(unittest.TestCase):
    def test_selects_three_evenly_spaced_clips_per_ui_class(self):
        rows = [
            {"path": f"{label}/{index}.wav", "expected": label, "label": label}
            for label in LABELS
            for index in range(10)
        ]

        selected = select_balanced_sample(rows, 3)

        self.assertEqual(len(selected), 12)
        self.assertEqual(
            {label: sum(row["expected"] == label for row in selected) for label in LABELS},
            {label: 3 for label in LABELS},
        )
        self.assertEqual(
            [row["path"] for row in selected if row["expected"] == "Neutral"],
            ["Neutral/1.wav", "Neutral/5.wav", "Neutral/8.wav"],
        )

    def test_frustrated_rows_share_the_ui_angry_quota(self):
        rows = [
            {"path": f"angry/{index}.wav", "expected": "Angry", "label": "Angry"}
            for index in range(2)
        ] + [
            {"path": f"frustrated/{index}.wav", "expected": "Angry", "label": "Frustrated"}
            for index in range(2)
        ]

        selected = select_balanced_sample(rows, 3)

        self.assertEqual(len(selected), 3)
        self.assertEqual(ui_label("Frustrated"), "Angry")


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Unit tests for overlap-based hard / no-harm content key gate."""

from __future__ import annotations

import unittest

from hard_content_key_gate import classify_content_key, overlap_gold_fraction


class OverlapGateTests(unittest.TestCase):
    def test_overlap_fraction(self) -> None:
        ov = overlap_gold_fraction(
            "what is the facility fee",
            ["The facility fee on unused commitments is 0.55%."],
        )
        self.assertIsNotNone(ov)
        assert ov is not None
        self.assertGreater(ov, 0.5)

    def test_hard_low_overlap(self) -> None:
        secs = [
            {
                "id": "sec-a",
                "text": "Borrower shall maintain insurance and provide quarterly certificates.",
            }
        ]
        rec = classify_content_key(
            question="After noise blocks, what spread applies in pricing?",
            gold_sections=["sec-a"],
            sections=secs,
        )
        self.assertEqual(rec["cohort"], "hard")
        self.assertTrue(rec["ok_hard"])
        self.assertFalse(rec["ok_no_harm"])
        self.assertIsNotNone(rec["overlap_gold"])
        assert rec["overlap_gold"] is not None
        self.assertLess(rec["overlap_gold"], 0.3)

    def test_no_harm_high_overlap(self) -> None:
        secs = [
            {
                "id": "sec-schedules",
                "text": (
                    "The maximum aggregate principal of the Loans is USD 187,500,000. "
                    "Interest margin over Term SOFR is 4.125%."
                ),
            }
        ]
        rec = classify_content_key(
            question="What is the maximum aggregate principal of the Loans?",
            gold_sections=["sec-schedules"],
            sections=secs,
        )
        self.assertEqual(rec["cohort"], "no_harm")
        self.assertTrue(rec["ok_no_harm"])
        self.assertFalse(rec["ok_hard"])
        assert rec["overlap_gold"] is not None
        self.assertGreaterEqual(rec["overlap_gold"], 0.6)

    def test_does_not_use_keyword_rank(self) -> None:
        """Hardness is overlap only — distractors must not affect cohort."""
        secs = [
            {"id": "gold", "text": "alpha beta gamma unique marker phrase"},
            {"id": "noise", "text": "pricing schedule spread facility fee unused"},
        ]
        # Low overlap with gold even if question shares words with a distractor.
        rec = classify_content_key(
            question="What spread does the pricing schedule list for unused facility fee?",
            gold_sections=["gold"],
            sections=secs,
        )
        self.assertEqual(rec["cohort"], "hard")
        self.assertNotIn("kw_gold_rank", rec)

    def test_missing_gold(self) -> None:
        rec = classify_content_key(
            question="anything",
            gold_sections=[],
            sections=[{"id": "x", "text": "y"}],
        )
        self.assertEqual(rec["cohort"], "unscored")
        self.assertEqual(rec["reason"], "no_gold_sections")


if __name__ == "__main__":
    raise SystemExit(unittest.main())

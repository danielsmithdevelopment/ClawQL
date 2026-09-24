#!/usr/bin/env python3
"""Unit tests for gliner sidecar scoring helpers (no torch required for mock path)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import app as sidecar


class MockScoresTest(unittest.TestCase):
    def test_token_overlap_prefers_matching_label(self) -> None:
        labels = [
            sidecar.Label(id="hit", description="extract springing lien"),
            sidecar.Label(id="miss", description="post slack message"),
        ]
        scores = sidecar.mock_scores("extract springing lien fields", labels)
        self.assertEqual(scores[0].id, "hit")
        self.assertGreater(scores[0].confidence, scores[1].confidence)


class Gliner2ScoresTest(unittest.TestCase):
    def test_multilabel_classify_maps_id_confidences(self) -> None:
        labels = [
            sidecar.Label(id="skill.a", description="Skill A desc"),
            sidecar.Label(id="skill.b", description="Skill B desc"),
        ]
        fake_model = MagicMock()
        fake_schema = MagicMock()
        fake_model.create_schema.return_value = fake_schema
        fake_model.extract.return_value = {
            "choice": [("skill.a", 0.91), ("skill.b", 0.02)]
        }

        with patch.object(sidecar, "_gliner_model", fake_model):
            with patch.dict("sys.modules", {"gliner2": MagicMock()}):
                # Ensure import path is satisfied; model already set
                scores = sidecar.gliner2_scores("query text", labels)

        fake_schema.classification.assert_called_once()
        kwargs = fake_schema.classification.call_args
        self.assertTrue(kwargs.kwargs.get("multi_label") or kwargs[1].get("multi_label"))
        by_id = {s.id: s.confidence for s in scores}
        self.assertAlmostEqual(by_id["skill.a"], 0.91)
        self.assertAlmostEqual(by_id["skill.b"], 0.02)
        self.assertEqual(scores[0].id, "skill.a")


if __name__ == "__main__":
    unittest.main()

"""Sparse ARM START-END include lists for Harvey LAB GHA resume."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


def _parse(text: str):
    path = Path(__file__).resolve().parents[1] / "scripts" / "parse_nemotron_sweep_marker.py"
    spec = importlib.util.spec_from_file_location("parse_nemotron_sweep_marker", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.parse_marker(text)


class ParseNemotronSweepMarkerTest(unittest.TestCase):
    def test_two_cell_targeted_rerun(self) -> None:
        payload = _parse(
            "# comments ignored\n"
            "nemotron-clawql 9-9\n"
            "nemotron 22-22\n"
        )
        self.assertFalse(payload["empty"])
        self.assertEqual(payload["cell_count"], 2)
        self.assertEqual(
            payload["include"],
            [
                {
                    "arm": "nemotron-clawql",
                    "task": "firm-knowledge/tasks/009",
                    "task_id": "009",
                },
                {
                    "arm": "nemotron",
                    "task": "firm-knowledge/tasks/022",
                    "task_id": "022",
                },
            ],
        )
        self.assertEqual(payload["task_start"], 9)
        self.assertEqual(payload["task_end"], 22)

    def test_prefixed_range_is_not_cartesian(self) -> None:
        payload = _parse("nemotron-clawql 6-8\nnemotron 10-10\n")
        self.assertEqual(payload["cell_count"], 4)
        arms_tasks = {(c["arm"], c["task_id"]) for c in payload["include"]}
        self.assertEqual(
            arms_tasks,
            {
                ("nemotron-clawql", "006"),
                ("nemotron-clawql", "007"),
                ("nemotron-clawql", "008"),
                ("nemotron", "010"),
            },
        )

    def test_bare_26_50_is_fifty_cells(self) -> None:
        payload = _parse("26-50\n")
        self.assertFalse(payload["empty"])
        self.assertEqual(payload["cell_count"], 50)
        self.assertEqual(payload["task_start"], 26)
        self.assertEqual(payload["task_end"], 50)
        self.assertEqual(payload["arms"], ["nemotron", "nemotron-clawql"])
        self.assertEqual(
            {(c["arm"], c["task_id"]) for c in payload["include"] if c["task_id"] in {"026", "050"}},
            {
                ("nemotron", "026"),
                ("nemotron-clawql", "026"),
                ("nemotron", "050"),
                ("nemotron-clawql", "050"),
            },
        )


if __name__ == "__main__":
    unittest.main()

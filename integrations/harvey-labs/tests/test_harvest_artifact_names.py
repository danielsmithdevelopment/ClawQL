import unittest

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def _load():
    path = Path(__file__).resolve().parents[3] / "scripts" / "dev" / "harvest-harvey-lab-traces-to-r2.py"
    spec = spec_from_file_location("harvest_harvey_lab_traces_to_r2", path)
    assert spec and spec.loader
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class HarvestNameParseTest(unittest.TestCase):
    def test_clawql_cell(self) -> None:
        mod = _load()
        self.assertEqual(
            mod.parse_cell_artifact_name("harvey-lab-nemotron-clawql-009-32168856394"),
            {"arm": "nemotron-clawql", "task_id": "009", "run_id": "32168856394"},
        )

    def test_baseline_cell(self) -> None:
        mod = _load()
        self.assertEqual(
            mod.parse_cell_artifact_name("harvey-lab-nemotron-022-32168856394"),
            {"arm": "nemotron", "task_id": "022", "run_id": "32168856394"},
        )

    def test_sweep_summary_is_not_a_cell(self) -> None:
        mod = _load()
        self.assertIsNone(mod.parse_cell_artifact_name("harvey-lab-sweep-summary-32083312814"))


if __name__ == "__main__":
    unittest.main()

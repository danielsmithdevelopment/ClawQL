import os
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def _load(name: str):
    root = Path(__file__).resolve().parents[3]
    path = root / "scripts" / "dev" / name
    spec = spec_from_file_location(path.stem, path)
    assert spec and spec.loader
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class HarveyLabR2UploadTest(unittest.TestCase):
    def test_normalize_task_id(self) -> None:
        mod = _load("harvey_lab_r2.py")
        self.assertEqual(mod.normalize_task_id("firm-knowledge/tasks/009"), "009")
        self.assertEqual(mod.normalize_task_id("009"), "009")

    def test_cell_prefix_matches_harvest_layout(self) -> None:
        mod = _load("harvey_lab_r2.py")
        self.assertEqual(
            mod.cell_r2_prefix(day="2026/08/18", run_id="32168856394", arm="nemotron-clawql", task_id="009"),
            "raw/harvey-lab/2026/08/18/run-32168856394/nemotron-clawql/009",
        )
        self.assertEqual(
            mod.cell_r2_prefix(
                day="2026/08/18",
                run_id="32168856394",
                arm="_other",
                task_id="000",
                other_name="harvey-lab-sweep-summary-32168856394",
            ),
            "raw/harvey-lab/2026/08/18/run-32168856394/_other/harvey-lab-sweep-summary-32168856394",
        )

    def test_collect_transcript_and_call_store(self) -> None:
        mod = _load("harvey_lab_r2.py")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nemotron-clawql").mkdir()
            (root / "nemotron-clawql" / "transcript.jsonl").write_text("{}\n", encoding="utf-8")
            (root / "nemotron-clawql" / "scores.json").write_text("{}", encoding="utf-8")
            (root / "output").mkdir()
            (root / "output" / "response.md").write_text("ok", encoding="utf-8")
            names = {p.name for p in mod.collect_trace_files(root)}
            self.assertIn("transcript.jsonl", names)
            self.assertIn("scores.json", names)
            self.assertIn("response.md", names)

    def test_dry_run_upload_without_cloudflare_env(self) -> None:
        mod = _load("harvey_lab_r2.py")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nemotron").mkdir()
            (root / "nemotron" / "transcript.jsonl").write_text("{}\n", encoding="utf-8")
            out = mod.upload_cell_dir(
                root,
                arm="nemotron",
                task_id="001",
                run_id="local-test",
                source="local",
                dry_run=True,
                day="2026/08/18",
            )
            self.assertTrue(out["has_transcript"])
            self.assertEqual(out["objects_put"], 0)
            self.assertEqual(out["prefix"], "raw/harvey-lab/2026/08/18/run-local-test/nemotron/001")

    def test_cli_allow_missing_r2(self) -> None:
        import subprocess

        script = Path(__file__).resolve().parents[3] / "scripts" / "dev" / "upload-harvey-lab-cell-to-r2.py"
        with tempfile.TemporaryDirectory() as tmp:
            env = {k: v for k, v in os.environ.items() if "CLOUDFLARE" not in k and "CLAWQL_R2" not in k}
            proc = subprocess.run(
                [
                    "python3",
                    str(script),
                    "--results-dir",
                    tmp,
                    "--arm",
                    "nemotron",
                    "--task-id",
                    "001",
                    "--run-id",
                    "local",
                    "--source",
                    "local",
                    "--allow-missing-r2",
                ],
                check=False,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("skipping durable upload", proc.stderr)


if __name__ == "__main__":
    unittest.main()

"""Unit tests for ExtractBench ontology sync bridge (no live Node required)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "provider"))

from clawql_idp.ontology_sync import (  # noqa: E402
    derive_document_type,
    ontology_sync_enabled,
    run_ontology_pipeline,
    t1_completeness_metrics,
)


class OntologySyncTests(unittest.TestCase):
    def test_derive_document_type_from_title(self) -> None:
        schema = {"title": "Brokerage Statement", "type": "object"}
        self.assertEqual(derive_document_type(schema), "brokerage_statement")

    def test_ontology_sync_env_flag(self) -> None:
        with patch.dict("os.environ", {"CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC": "1"}):
            self.assertTrue(ontology_sync_enabled())
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(ontology_sync_enabled())

    def test_run_ontology_pipeline_parses_stdout(self) -> None:
        summary = {
            "entityId": "invoice",
            "rowsPopulated": {"lineItems": 3},
            "recall": {"ok": True, "hits": [{"fields": {"lineItems": [1, 2, 3]}}]},
        }

        def fake_run(*_args, **_kwargs):
            class Proc:
                returncode = 0
                stdout = json.dumps(summary) + "\n"
                stderr = ""

            return Proc()

        with patch("clawql_idp.ontology_sync.subprocess.run", fake_run):
            with patch.dict("os.environ", {"CLAWQL_OBSIDIAN_VAULT_PATH": "/tmp/vault"}):
                out = run_ontology_pipeline(
                    json_schema={"title": "Invoice", "type": "object"},
                    extracted={"invoiceNumber": "1", "lineItems": [{}, {}, {}]},
                    document_id="ex-1",
                )
        self.assertEqual(out["entityId"], "invoice")
        self.assertEqual(out["documentType"], "invoice")

    def test_t1_completeness_metrics(self) -> None:
        schema = {
            "type": "object",
            "properties": {
                "lineItems": {"type": "array", "items": {"type": "object"}},
            },
        }
        result = {
            "rowsPopulated": {"lineItems": 47},
            "recall": {
                "ok": True,
                "hits": [{"fields": {"lineItems": [{}] * 47}}],
            },
        }
        metrics = t1_completeness_metrics(result, schema)
        self.assertTrue(metrics["complete"])
        self.assertTrue(metrics["arrays"]["lineItems"]["match"])


if __name__ == "__main__":
    unittest.main()

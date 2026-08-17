"""Tests for L0 open_facts + DuckDB trust (NULL ≠ false)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

try:
    import duckdb  # noqa: F401

    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False

from clawql_lab_duckdb import build_matters_duckdb, run_readonly_sql
from clawql_lab_evidence import (
    extract_open_facts_from_text,
    nullable_bool,
    preflight_matters_trust,
)
from clawql_lab_matter_schema import FIELD_MAINTENANCE_FC, empty_matter_fields


class EvidenceTrustTests(unittest.TestCase):
    def test_nullable_bool(self) -> None:
        self.assertIsNone(nullable_bool(None))
        self.assertTrue(nullable_bool(True))
        self.assertFalse(nullable_bool(False))
        self.assertIsNone(nullable_bool("maybe"))

    def test_empty_matter_fields_default_null_bools(self) -> None:
        fields = empty_matter_fields()
        self.assertIsNone(fields[FIELD_MAINTENANCE_FC])
        self.assertIsNone(fields["is_covenant_lite"])

    def test_open_facts_sku_and_maintenance_surface(self) -> None:
        body = (
            "Product catalog\n"
            "SKU: ABC-99\n"
            "The Credit Agreement contains a financial maintenance covenant "
            "tested quarterly.\n"
        )
        facts = extract_open_facts_from_text(
            body, matter_id="1006-00001", rel_doc="docs/ca.docx"
        )
        keys = {f["fact_key"] for f in facts}
        self.assertIn("kv.SKU", keys)
        self.assertIn("surface.financial_maintenance_covenant", keys)
        sku = next(f for f in facts if f["fact_key"] == "kv.SKU")
        self.assertEqual(sku["fact_value"], "ABC-99")

    def test_preflight_flags_all_false_maintenance(self) -> None:
        rows = [
            {
                "matter_id": "a",
                "is_credit_facility": True,
                "has_maintenance_financial_covenant": False,
            },
            {
                "matter_id": "b",
                "is_credit_facility": True,
                "has_maintenance_financial_covenant": False,
            },
        ]
        problems = preflight_matters_trust(rows)
        self.assertTrue(any("has_maintenance_financial_covenant=false" in p for p in problems))

    def test_preflight_allows_null_unknown(self) -> None:
        rows = [
            {
                "matter_id": "a",
                "is_credit_facility": True,
                "has_maintenance_financial_covenant": None,
            },
            {
                "matter_id": "b",
                "is_credit_facility": True,
                "has_maintenance_financial_covenant": True,
                "has_maintenance_financial_covenant_proof_doc": "ca.docx",
            },
        ]
        problems = preflight_matters_trust(rows)
        self.assertEqual(problems, [])

    @unittest.skipUnless(HAS_DUCKDB, "duckdb not installed")
    def test_build_stores_null_and_open_facts(self) -> None:
        rows = [
            {
                "matter_id": "1006-00001",
                "client_short_name": "Crestline",
                "practice_area": "Banking & Finance",
                "matter_type": "Credit Facility",
                "title": "1006",
                "is_credit_facility": True,
                "is_hsr_second_request": False,
                "mentions_springing_lien": False,
                "has_revolving_facility": True,
                "is_secured": True,
                "deal_date": None,
                "has_incremental_facility": None,
                "facility_amount_usd": None,
                "has_maintenance_financial_covenant": None,
                "sandbox_root": "/workspace/documents/matters/1006-00001",
                "vault_note_path": "Memory/x.md",
                "_open_facts": [
                    {
                        "matter_id": "1006-00001",
                        "rel_doc": "ca.docx",
                        "fact_key": "surface.financial_maintenance_covenant",
                        "fact_value": "financial maintenance covenant",
                        "evidence_snippet": "contains a financial maintenance covenant",
                        "extractor": "open-kv-v0",
                    }
                ],
            }
        ]
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "matters.duckdb"
            build_matters_duckdb(db, rows)
            nulls = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE has_maintenance_financial_covenant IS NULL",
            )
            self.assertEqual(nulls["rowCount"], 1)
            facts = run_readonly_sql(
                db,
                "SELECT fact_key FROM open_facts WHERE matter_id = '1006-00001'",
            )
            self.assertEqual(facts["rowCount"], 1)
            self.assertEqual(
                facts["rows"][0]["fact_key"],
                "surface.financial_maintenance_covenant",
            )


if __name__ == "__main__":
    unittest.main()

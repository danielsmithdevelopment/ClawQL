"""Tests for L0 open_facts + DuckDB trust (NULL ≠ false)."""

from __future__ import annotations

import unittest

from clawql_lab_evidence import (
    extract_open_facts_from_text,
    nullable_bool,
    preflight_matters_trust,
)

FIELD_MAINTENANCE_FC = "has_maintenance_financial_covenant"


class EvidenceTrustTests(unittest.TestCase):
    def test_nullable_bool(self) -> None:
        self.assertIsNone(nullable_bool(None))
        self.assertTrue(nullable_bool(True))
        self.assertFalse(nullable_bool(False))
        self.assertIsNone(nullable_bool("maybe"))

    def test_empty_matter_fields_default_null_bools(self) -> None:
        fields = {
            FIELD_MAINTENANCE_FC: None,
            "is_covenant_lite": None,
        }
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


if __name__ == "__main__":
    unittest.main()

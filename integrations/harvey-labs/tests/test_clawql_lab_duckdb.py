"""Unit tests for LAB DuckDB SQL-first retrieval spike."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

try:
    import duckdb  # noqa: F401

    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False

from clawql_lab_duckdb import (
    build_matters_duckdb,
    matter_mentions_springing_lien,
    run_readonly_sql,
    validate_readonly_select,
)


class DuckdbLabTests(unittest.TestCase):
    def test_validate_rejects_writes(self) -> None:
        with self.assertRaises(ValueError):
            validate_readonly_select("DELETE FROM matters")
        with self.assertRaises(ValueError):
            validate_readonly_select("SELECT 1; SELECT 2")
        validate_readonly_select(
            "SELECT matter_id FROM matters WHERE is_credit_facility"
        )

    @unittest.skipUnless(HAS_DUCKDB, "duckdb not installed")
    def test_build_and_query_credit_facility_cohort(self) -> None:
        rows = [
            {
                "matter_id": "1005-00001",
                "client_short_name": "Nexford",
                "practice_area": "Banking & Finance",
                "matter_type": "Credit Facility",
                "title": "1005-00001 — Nexford — CREDIT_FACILITY",
                "is_credit_facility": True,
                "is_hsr_second_request": False,
                "mentions_springing_lien": False,
                "sandbox_root": "/workspace/documents/matters/1005-00001",
                "vault_note_path": "Memory/x.md",
            },
            {
                "matter_id": "1008-00001",
                "client_short_name": "Lumos Analytics",
                "practice_area": "Banking & Finance",
                "matter_type": "Credit Facility",
                "title": "1008-00001 — Lumos — CREDIT_FACILITY",
                "is_credit_facility": True,
                "is_hsr_second_request": False,
                "mentions_springing_lien": False,
                "sandbox_root": "/workspace/documents/matters/1008-00001",
                "vault_note_path": "Memory/y.md",
            },
            {
                "matter_id": "1001-00001",
                "client_short_name": "Other",
                "practice_area": "Other",
                "matter_type": "Other",
                "title": "1001-00001",
                "is_credit_facility": False,
                "is_hsr_second_request": False,
                "mentions_springing_lien": False,
                "sandbox_root": "/workspace/documents/matters/1001-00001",
                "vault_note_path": "Memory/z.md",
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "matters.duckdb"
            build_matters_duckdb(db, rows)
            out = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters WHERE is_credit_facility ORDER BY matter_id",
            )
            self.assertTrue(out["ok"], out)
            ids = [r["matter_id"] for r in out["rows"]]
            self.assertEqual(ids, ["1005-00001", "1008-00001"])
            freq = run_readonly_sql(
                db,
                "SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k, "
                "count(*) AS n FROM matters WHERE is_credit_facility",
            )
            self.assertTrue(freq["ok"], freq)
            self.assertEqual(freq["rows"][0]["k"], 0)
            self.assertEqual(freq["rows"][0]["n"], 2)

    def test_springing_lien_filename_hit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "m1"
            matter.mkdir()
            (matter / "springing-lien-analysis.docx").write_bytes(b"PK")
            self.assertTrue(matter_mentions_springing_lien(matter))


if __name__ == "__main__":
    unittest.main()

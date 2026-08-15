"""Unit tests for LAB DuckDB SQL-first retrieval spike."""

from __future__ import annotations

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
    extract_credit_facility_matter_fields,
    matter_mentions_springing_lien,
    run_readonly_sql,
    validate_readonly_select,
)

_DMS = Path(
    "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
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
                "has_revolving_facility": False,
                "is_secured": True,
                "deal_date": "2025-03-28",
                "has_incremental_facility": True,
                "facility_amount_usd": 1_400_000_000.0,
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
                "has_revolving_facility": True,
                "is_secured": True,
                "deal_date": "2023-03-09",
                "has_incremental_facility": False,
                "facility_amount_usd": 30_000_000.0,
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
                "has_revolving_facility": False,
                "is_secured": False,
                "deal_date": None,
                "has_incremental_facility": False,
                "facility_amount_usd": None,
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
            top = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters WHERE has_incremental_facility "
                "AND facility_amount_usd IS NOT NULL "
                "ORDER BY facility_amount_usd DESC LIMIT 1",
            )
            self.assertEqual(top["rows"][0]["matter_id"], "1005-00001")

    def test_springing_lien_filename_hit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "m1"
            matter.mkdir()
            (matter / "springing-lien-analysis.docx").write_bytes(b"PK")
            self.assertTrue(matter_mentions_springing_lien(matter))

    def test_revolving_path_hit(self) -> None:
        from clawql_lab_duckdb import matter_has_revolving_facility

        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "m1"
            docs = matter / "documents"
            docs.mkdir(parents=True)
            (docs / "revolving-loan-note-ncb.docx").write_bytes(b"PK")
            self.assertTrue(matter_has_revolving_facility(matter))

    @unittest.skipUnless(_DMS.is_dir(), "local harvey-labs DMS not available")
    @unittest.skipUnless(HAS_DUCKDB, "duckdb not installed")
    def test_offline_dms_sql_gold_018_020_023_024(self) -> None:
        """Calibration — gold IDs never seeded into production tables."""
        from clawql_lab_session import detect_credit_facility, _docx_to_text

        def _extract(path: Path) -> str:
            return (
                _docx_to_text(path, max_chars=200000)
                if path.suffix.lower() == ".docx"
                else ""
            )

        rows = []
        for matter_dir in sorted(p for p in _DMS.iterdir() if p.is_dir()):
            credit = detect_credit_facility(matter_dir)
            is_cf = bool(credit["is_credit_facility"])
            fields = (
                extract_credit_facility_matter_fields(
                    matter_dir, text_extractor=_extract
                )
                if is_cf
                else {}
            )
            rows.append(
                {
                    "matter_id": matter_dir.name,
                    "client_short_name": "",
                    "practice_area": credit["practice_area"],
                    "matter_type": credit["matter_type"],
                    "title": matter_dir.name,
                    "is_credit_facility": is_cf,
                    "is_hsr_second_request": False,
                    "mentions_springing_lien": bool(
                        fields.get("mentions_springing_lien")
                    ),
                    "has_revolving_facility": bool(
                        fields.get("has_revolving_facility")
                    ),
                    "is_secured": bool(fields.get("is_secured")),
                    "deal_date": fields.get("deal_date"),
                    "has_incremental_facility": bool(
                        fields.get("has_incremental_facility")
                    ),
                    "facility_amount_usd": fields.get("facility_amount_usd"),
                    "sandbox_root": str(matter_dir),
                    "vault_note_path": "",
                }
            )
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "matters.duckdb"
            build_matters_duckdb(db, rows)
            kn = run_readonly_sql(
                db,
                "SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k, "
                "count(*) AS n FROM matters WHERE is_credit_facility",
            )
            self.assertEqual(kn["rows"][0]["k"], 0)
            self.assertEqual(kn["rows"][0]["n"], 12)
            revolvers = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE is_credit_facility AND has_revolving_facility "
                "ORDER BY matter_id",
            )
            self.assertEqual(
                {r["matter_id"] for r in revolvers["rows"]},
                {"1008-00001", "1012-00001", "1019-00002", "1038-00002"},
            )
            top020 = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE has_incremental_facility AND facility_amount_usd IS NOT NULL "
                "ORDER BY facility_amount_usd DESC LIMIT 1",
            )
            self.assertEqual(top020["rows"][0]["matter_id"], "1005-00001")
            top023 = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE is_credit_facility AND is_secured AND deal_date IS NOT NULL "
                "ORDER BY deal_date DESC LIMIT 1",
            )
            self.assertEqual(top023["rows"][0]["matter_id"], "1013-00001")


if __name__ == "__main__":
    unittest.main()

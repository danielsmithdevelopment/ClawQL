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
                "has_revolving_facility": True,
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
            revolvers = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE is_credit_facility AND has_revolving_facility "
                "ORDER BY matter_id",
            )
            self.assertTrue(revolvers["ok"], revolvers)
            self.assertEqual(
                [r["matter_id"] for r in revolvers["rows"]],
                ["1005-00001", "1008-00001"],
            )

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

    @unittest.skipUnless(
        Path(
            "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
        ).is_dir(),
        "local harvey-labs DMS not available",
    )
    def test_offline_dms_task024_revolver_sql_matches_public_gold(self) -> None:
        """Calibration only — gold IDs are never seeded into production tables."""
        from clawql_lab_duckdb import matter_has_revolving_facility
        from clawql_lab_session import detect_credit_facility, _docx_to_text

        dms = Path(
            "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
        )
        gold = {
            "1008-00001",
            "1012-00001",
            "1019-00002",
            "1038-00002",
        }

        def _extract(path: Path) -> str:
            return _docx_to_text(path, max_chars=200000) if path.suffix.lower() == ".docx" else ""

        rows = []
        for matter_dir in sorted(p for p in dms.iterdir() if p.is_dir()):
            credit = detect_credit_facility(matter_dir)
            is_cf = bool(credit["is_credit_facility"])
            rows.append(
                {
                    "matter_id": matter_dir.name,
                    "client_short_name": "",
                    "practice_area": credit["practice_area"],
                    "matter_type": credit["matter_type"],
                    "title": matter_dir.name,
                    "is_credit_facility": is_cf,
                    "is_hsr_second_request": False,
                    "mentions_springing_lien": False,
                    "has_revolving_facility": (
                        matter_has_revolving_facility(
                            matter_dir, text_extractor=_extract
                        )
                        if is_cf
                        else False
                    ),
                    "sandbox_root": str(matter_dir),
                    "vault_note_path": "",
                }
            )
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "matters.duckdb"
            build_matters_duckdb(db, rows)
            out = run_readonly_sql(
                db,
                "SELECT matter_id FROM matters "
                "WHERE is_credit_facility AND has_revolving_facility "
                "ORDER BY matter_id",
            )
            self.assertTrue(out["ok"], out)
            ids = {r["matter_id"] for r in out["rows"]}
            self.assertEqual(ids, gold)


if __name__ == "__main__":
    unittest.main()

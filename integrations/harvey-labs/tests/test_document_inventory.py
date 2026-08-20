"""Unit tests for Layer 2 matter_documents inventory (Phase 1)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

try:
    import duckdb  # noqa: F401

    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False

from clawql_lab_matter_schema import (
    catalog_all_matter_files,
    extract_key_terms_from_text,
    infer_doc_type,
)

if HAS_DUCKDB:
    from clawql_lab_duckdb import build_matters_duckdb, run_readonly_sql


class InferDocTypeTests(unittest.TestCase):
    def test_lock_up(self) -> None:
        self.assertEqual(
            infer_doc_type("Offering/docs", "form-of-lock-up-agreement.docx"),
            "lock-up-agreement",
        )
        self.assertEqual(
            infer_doc_type("x", "lockup-period-memo.docx"),
            "lock-up-agreement",
        )

    def test_dip(self) -> None:
        self.assertEqual(
            infer_doc_type("Restructuring/DIP", "dip-financing-order.docx"),
            "dip-financing",
        )
        self.assertEqual(
            infer_doc_type("docs/debtor-in-possession", "motion.docx"),
            "dip-financing",
        )

    def test_withdrawal(self) -> None:
        self.assertEqual(
            infer_doc_type("Offering", "notice-of-withdrawal.docx"),
            "withdrawal-notice",
        )

    def test_credit_agreement(self) -> None:
        self.assertEqual(
            infer_doc_type("Transaction Documents", "credit-agreement-execution.docx"),
            "credit-agreement",
        )

    def test_other(self) -> None:
        self.assertEqual(
            infer_doc_type("Correspondence", "cover-email.txt"),
            "other",
        )


class CatalogAllMatterFilesTests(unittest.TestCase):
    def test_catalog_finds_files_in_temp_matter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1010-00002"
            (matter / "Offering").mkdir(parents=True)
            (matter / "Offering" / "form-of-lock-up-agreement.docx").write_bytes(b"PK")
            (matter / "notes.txt").write_text("hello", encoding="utf-8")
            (matter / "photo.png").write_bytes(b"\x89PNG")
            rows = catalog_all_matter_files(matter)
            rels = {r["rel_path"] for r in rows}
            self.assertIn("Offering/form-of-lock-up-agreement.docx", rels)
            self.assertIn("notes.txt", rels)
            self.assertIn("photo.png", rels)
            lock = next(
                r for r in rows if r["filename"] == "form-of-lock-up-agreement.docx"
            )
            self.assertEqual(lock["doc_type"], "lock-up-agreement")
            self.assertEqual(lock["ext"], "docx")
            self.assertGreater(lock["file_size_bytes"] or 0, 0)


class ExtractKeyTermsTests(unittest.TestCase):
    def test_lock_up_180_days(self) -> None:
        text = (
            "The lock-up period is 180 days following the effective date "
            "of the registration statement."
        )
        terms = extract_key_terms_from_text(
            text, doc_type="lock-up-agreement", filename="form-of-lock-up.docx"
        )
        self.assertEqual(terms.get("lock_up_period_days"), 180)
        self.assertEqual(terms.get("lock_up_period"), "180 days")


@unittest.skipUnless(HAS_DUCKDB, "duckdb not installed")
class MatterDocumentsDuckdbTests(unittest.TestCase):
    def test_build_with_matter_documents_join(self) -> None:
        rows = [
            {
                "matter_id": "1010-00002",
                "client_short_name": "Arbor Health",
                "practice_area": "Capital Markets",
                "matter_type": "Offering",
                "title": "1010-00002 — Arbor",
                "is_credit_facility": False,
                "is_hsr_second_request": False,
                "document_count": 1,
                "indexed_doc_count": 1,
                "matter_status": None,
                "sandbox_root": "/workspace/documents/matters/1010-00002",
                "vault_note_path": "Memory/a.md",
                "_matter_documents": [
                    {
                        "rel_path": "Offering/form-of-lock-up-agreement.docx",
                        "filename": "form-of-lock-up-agreement.docx",
                        "ext": "docx",
                        "doc_type": "lock-up-agreement",
                        "file_size_bytes": 100,
                        "key_terms": {
                            "lock_up_period_days": 180,
                            "source": "local_heuristic",
                        },
                        "text_snippet": "lock-up period is 180 days",
                        "parse_status": "ok",
                    }
                ],
            },
            {
                "matter_id": "1008-00001",
                "client_short_name": "Lumos",
                "practice_area": "Banking & Finance",
                "matter_type": "Credit Facility",
                "title": "1008 — Lumos — CREDIT_FACILITY",
                "is_credit_facility": True,
                "is_hsr_second_request": False,
                "document_count": 0,
                "indexed_doc_count": 0,
                "sandbox_root": "/workspace/documents/matters/1008-00001",
                "vault_note_path": "Memory/b.md",
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "matters.duckdb"
            build_matters_duckdb(db, rows)
            out = run_readonly_sql(
                db,
                "SELECT m.matter_id, d.filename, "
                "CAST(d.key_terms->>'lock_up_period_days' AS INTEGER) AS days "
                "FROM matters m "
                "JOIN matter_documents d ON m.matter_id = d.matter_id "
                "WHERE lower(m.practice_area) LIKE '%capital%market%' "
                "AND d.doc_type = 'lock-up-agreement'",
            )
            self.assertTrue(out["ok"], out)
            self.assertEqual(len(out["rows"]), 1)
            self.assertEqual(out["rows"][0]["matter_id"], "1010-00002")
            self.assertEqual(out["rows"][0]["days"], 180)
            view = run_readonly_sql(
                db,
                "SELECT matter_id, doc_type FROM documents_by_type "
                "WHERE doc_type = 'lock-up-agreement'",
            )
            self.assertEqual(view["rows"][0]["matter_id"], "1010-00002")
            # Existing credit view still works
            cf = run_readonly_sql(
                db, "SELECT matter_id FROM credit_facilities ORDER BY matter_id"
            )
            self.assertEqual([r["matter_id"] for r in cf["rows"]], ["1008-00001"])
            # Hint mentions Pattern G
            hint = run_readonly_sql(db, "SELECT 1 AS x")
            self.assertIn("Pattern G", hint.get("hint") or "")
            self.assertIn("matter_documents", hint.get("hint") or "")


if __name__ == "__main__":
    unittest.main()

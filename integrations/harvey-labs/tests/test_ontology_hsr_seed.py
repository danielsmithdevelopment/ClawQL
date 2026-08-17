"""Ontology / HSR Second Request seeding for Harvey LAB firm-knowledge."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness" / "adapters"))

from clawql_lab_session import (  # noqa: E402
    _clawql_field_block,
    _enrich_lab_memory_recall,
    detect_credit_facility,
    detect_hsr_second_request,
)


def _write_docx(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Minimal WordprocessingML package
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
    )
    with ZipFile(path, "w") as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        zf.writestr("word/document.xml", document_xml)


class HsrSecondRequestDetectionTests(unittest.TestCase):
    def test_filename_second_request_non_prep(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1003-00001"
            _write_docx(
                matter / "Memos" / "second-request-strategy-memo.docx",
                "Strategy for responding.",
            )
            det = detect_hsr_second_request(matter)
            self.assertTrue(det["received"])
            self.assertTrue(
                any("second-request-strategy" in e for e in det["evidence_files"])
            )

    def test_preparation_filename_alone_is_not_enough(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1001-00004"
            _write_docx(
                matter / "Antitrust & Regulatory" / "second-request-preparation-memo.docx",
                "Preparation strategy if a second request arrives.",
            )
            det = detect_hsr_second_request(matter)
            self.assertFalse(det["received"])

    def test_defined_term_in_status_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1038-00001"
            _write_docx(
                matter / "Correspondence" / "joint-status-report.docx",
                'The FTC issued a Request for Additional Information '
                '(the "Second Request") on May 7, 2025.',
            )
            det = detect_hsr_second_request(matter)
            self.assertTrue(det["received"])
            self.assertTrue(
                any("joint-status-report" in e for e in det["evidence_files"])
            )

    def test_clawql_field_block_includes_matter_id(self) -> None:
        block = _clawql_field_block(
            "1003-00001",
            title="1003-00001 — Harrowgate — HSR_SECOND_REQUEST",
            practice_area="Other",
            matter_type="Advisory",
        )
        self.assertIn("CLAWQL_MATTER_ID=1003-00001", block)
        self.assertIn("HSR_SECOND_REQUEST", block)

    def test_credit_agreement_docx_flags_credit_facility(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1005-00001"
            _write_docx(
                matter
                / "Transaction Documents"
                / "Credit Agreement"
                / "credit-agreement-execution-version.docx",
                "Senior secured revolving credit facility.",
            )
            det = detect_credit_facility(matter)
            self.assertTrue(det["is_credit_facility"])
            self.assertEqual(det["practice_area"], "Banking & Finance")
            self.assertEqual(det["matter_type"], "Credit Facility")
            self.assertTrue(
                any("credit-agreement" in e for e in det["evidence_files"])
            )

    def test_bridge_and_term_loan_execution_flags_credit_facility(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = Path(tmp) / "1010-00001"
            _write_docx(
                bridge / "Transaction Documents" / "bridge-loan-agreement-execution.docx",
                "Bridge loan facility.",
            )
            self.assertTrue(detect_credit_facility(bridge)["is_credit_facility"])

            term = Path(tmp) / "1042-00001"
            _write_docx(
                term / "Transaction Documents" / "term-loan-agreement-execution.docx",
                "Term loan facility.",
            )
            self.assertTrue(detect_credit_facility(term)["is_credit_facility"])

    def test_financing_draft_and_diligence_memo_are_not_credit_facility(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            financing = Path(tmp) / "1003-00003"
            _write_docx(
                financing / "Financing" / "credit-agreement-execution.docx",
                "PE financing side letter book.",
            )
            self.assertFalse(detect_credit_facility(financing)["is_credit_facility"])

            diligence = Path(tmp) / "1002-00004"
            _write_docx(
                diligence / "Diligence" / "credit-facility-review-memo.docx",
                "Review of target credit facility.",
            )
            self.assertFalse(detect_credit_facility(diligence)["is_credit_facility"])

    def test_unrelated_matter_is_not_credit_facility(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1001-00001"
            _write_docx(
                matter / "Engagement" / "engagement-letter.docx",
                "Antitrust counseling engagement.",
            )
            det = detect_credit_facility(matter)
            self.assertFalse(det["is_credit_facility"])
            self.assertEqual(det["practice_area"], "Other")

    def test_enrich_recall_adds_sandbox_roots_and_guidance(self) -> None:
        raw = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "ok": True,
                            "queryType": "structured_predicate",
                            "indexUsed": "ontology",
                            "hits": [
                                {
                                    "path": "Memory/matter-1003-00001.md",
                                    "entityId": "1003-00001",
                                    "fields": {"id": "1003-00001", "title": "x"},
                                    "snippet": "…",
                                }
                            ],
                            "results": [
                                {
                                    "path": "Memory/matter-1003-00001.md",
                                    "score": 1,
                                    "depth": 0,
                                    "reason": "keyword",
                                    "snippet": "…",
                                }
                            ],
                        }
                    ),
                }
            ]
        }
        enriched = _enrich_lab_memory_recall(raw)
        self.assertEqual(
            enriched["hits"][0]["sandboxDocumentRoot"],
            "/workspace/documents/matters/1003-00001",
        )
        self.assertEqual(enriched["results"][0]["reason"], "structured_predicate")
        self.assertIn("requiredDeliverable", enriched["labGuidance"])
        self.assertIn("/workspace/output/", enriched["labGuidance"]["requiredDeliverable"])
        self.assertIn("evidenceRule", enriched["labGuidance"])
        self.assertIn("contextDiscipline", enriched["labGuidance"])
        self.assertEqual(enriched["matterIds"], ["1003-00001"])
        self.assertEqual(enriched["matterIdCount"], 1)
        self.assertIn("cohortRule", enriched["labGuidance"])
        # matterIds appear before hits in serialization order
        keys = list(enriched.keys())
        self.assertLess(keys.index("matterIds"), keys.index("hits"))

    def test_empty_recall_adds_fallback_guidance(self) -> None:
        from clawql_lab_session import _enrich_lab_memory_recall

        enriched = _enrich_lab_memory_recall(
            {
                "ok": True,
                "query": "covenant-lite",
                "hits": [],
                "results": [],
                "queryType": "structured_predicate",
                "indexUsed": "ontology",
            }
        )
        self.assertEqual(enriched["hits"], [])
        self.assertIn("fallback", enriched["labGuidance"])
        self.assertIn("grep", enriched["labGuidance"]["fallback"].lower())

    def test_client_hint_uses_rubric_short_names(self) -> None:
        dms = Path(
            "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
        )
        if not dms.is_dir():
            self.skipTest("local harvey-labs DMS not available")
        from clawql_lab_session import _client_hint, _preferred_evidence_paths

        expected = {
            "1003-00001": "Harrowgate PE",
            "1038-00001": "Cascade Retail",
            "1041-00001": "Solara Digital",
            "1003-00003": "Harrowgate PE",
            "1032-00005": "Halcyon Semi",
            "1038-00009": "Cascade Retail",
        }
        for matter_id, short_name in expected.items():
            self.assertEqual(
                _client_hint(dms / matter_id),
                short_name,
                msg=matter_id,
            )

        prefs = _preferred_evidence_paths(dms / "1038-00001")
        self.assertTrue(any("joint-status-report" in p for p in prefs))
        prefs1041 = _preferred_evidence_paths(dms / "1041-00001")
        self.assertTrue(
            any(
                "substantial-compliance" in p or "custodian-identification" in p
                for p in prefs1041
            )
        )
        # Engagement letters must never appear as preferred Second Request evidence.
        for matter_id in expected:
            for path in _preferred_evidence_paths(dms / matter_id):
                self.assertNotIn("engagement", path.lower(), msg=path)

    def test_client_hint_canonicalizes_truncated_body_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            matter = Path(tmp) / "1032-00005"
            _write_docx(
                matter / "engagement-letter-halcyon.docx",
                "We are pleased to represent Halcyon in this matter.",
            )
            from clawql_lab_session import _client_hint

            self.assertEqual(_client_hint(matter), "Halcyon Semi")

    def test_canonicalize_client_strips_newlines(self) -> None:
        from clawql_lab_session import _canonicalize_client

        # Probe #6: body regex glued "MAIL AND DocuSign\nLumos Analytics Inc"
        # into CLAWQL_TITLE and dropped CREDIT_FACILITY onto the next line.
        self.assertEqual(
            _canonicalize_client("MAIL AND DocuSign\nLumos Analytics Inc"),
            "MAIL AND DocuSign Lumos Analytics Inc",
        )
        self.assertNotIn("\n", _canonicalize_client("foo\tbar\nbaz"))


if __name__ == "__main__":
    unittest.main()

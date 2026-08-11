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


if __name__ == "__main__":
    unittest.main()

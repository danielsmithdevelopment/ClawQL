"""Unit tests for ExtractBench ClawQL IDP helpers (no live MCP required)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "provider"))

from clawql_idp.mcp_client import unwrap_mcp_tool_result  # noqa: E402
from clawql_idp.schema_map import (  # noqa: E402
    chunk_text_for_mapping,
    merge_extraction_chunks,
    null_template_from_schema,
    parse_json_object,
    prepare_schema,
    promote_repeated_structure,
    structural_map_from_content,
)


class UnwrapMcpTests(unittest.TestCase):
    def test_unwraps_text_json(self) -> None:
        payload = {
            "content": [
                {"type": "text", "text": json.dumps({"ok": True, "route": "local_markdown"})}
            ]
        }
        out = unwrap_mcp_tool_result(payload)
        self.assertEqual(out["route"], "local_markdown")

    def test_passthrough_dict(self) -> None:
        raw = {"ok": True}
        self.assertEqual(unwrap_mcp_tool_result(raw), raw)


class SchemaMapTests(unittest.TestCase):
    def test_promote_repeated_structure(self) -> None:
        schema = {
            "type": "object",
            "properties": {"title": {"type": "string"}},
            "repeated_structure": {
                "holdings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}, "shares": {"type": "string"}},
                    },
                }
            },
        }
        out = promote_repeated_structure(schema)
        self.assertIn("holdings", out["properties"])
        self.assertNotIn("repeated_structure", out)

    def test_parse_fenced_json(self) -> None:
        text = 'Here you go:\n```json\n{"a": 1}\n```\n'
        self.assertEqual(parse_json_object(text), {"a": 1})

    def test_null_template(self) -> None:
        schema = {
            "type": "object",
            "properties": {
                "issuer": {"type": "string"},
                "rows": {"type": "array", "items": {"type": "object"}},
            },
        }
        self.assertEqual(null_template_from_schema(schema), {"issuer": None, "rows": []})

    def test_structural_table_map(self) -> None:
        schema = {
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "shares": {"type": "string"},
                        },
                    },
                }
            },
        }
        layout = {
            "tables": [
                {
                    "data": [
                        ["Name", "Shares"],
                        ["Acme Corp", "100"],
                        ["Beta LLC", "250"],
                    ]
                }
            ]
        }
        out = structural_map_from_content(markdown="", layout_json=layout, schema=schema)
        self.assertEqual(len(out["holdings"]), 2)
        self.assertEqual(out["holdings"][0]["name"], "Acme Corp")
        self.assertEqual(out["holdings"][1]["shares"], "250")

    def test_label_value_markdown(self) -> None:
        schema = {
            "type": "object",
            "properties": {"issuer_name": {"type": "string"}},
        }
        md = "Issuer Name: Contoso Fund LLC\nDate: 2024-01-01\n"
        out = structural_map_from_content(markdown=md, layout_json=None, schema=schema)
        self.assertEqual(out["issuer_name"], "Contoso Fund LLC")

    def test_chunk_and_merge_arrays(self) -> None:
        text = "a" * 250
        chunks = chunk_text_for_mapping(text, max_chars=100)
        self.assertGreater(len(chunks), 1)
        schema = prepare_schema(
            {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"id": {"type": "string"}},
                        },
                    }
                },
            },
            close_objects=False,
        )
        base = null_template_from_schema(schema)
        merged = merge_extraction_chunks(
            base,
            [
                {"items": [{"id": "1"}, {"id": "2"}]},
                {"items": [{"id": "2"}, {"id": "3"}]},
            ],
            schema,
        )
        self.assertEqual([r["id"] for r in merged["items"]], ["1", "2", "3"])


if __name__ == "__main__":
    unittest.main()

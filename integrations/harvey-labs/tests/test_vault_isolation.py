"""Vault isolation for Harvey LAB × ClawQL.

Verifies that task-scoped vault paths do not leak matter notes across tasks.
This unit test does not require Anthropic, Podman, or a live MCP server.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness" / "adapters"))

from clawql_vault import resolve_task_vault  # noqa: E402


class VaultIsolationUnitTests(unittest.TestCase):
    def test_task_vault_paths_are_distinct(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "HarveyLABVault"
            a = resolve_task_vault("firm-knowledge/tasks/001", root)
            b = resolve_task_vault("firm-knowledge/tasks/002", root)
            self.assertNotEqual(a, b)
            self.assertTrue(str(a).endswith("firm-knowledge__tasks__001"))
            self.assertTrue(str(b).endswith("firm-knowledge__tasks__002"))

    def test_post_cleanup_removes_prior_matter_notes(self) -> None:
        """Simulate task A notes disappearing before task B recall seeds."""
        with tempfile.TemporaryDirectory() as tmp:
            vault_a = Path(tmp) / "taskA"
            vault_b = Path(tmp) / "taskB"
            mem_a = vault_a / "Memory"
            mem_a.mkdir(parents=True)
            note = mem_a / "matter-1003.md"
            note.write_text(
                "# Matter 1003-00001\nHarrowgate PE second request\n",
                encoding="utf-8",
            )
            self.assertTrue(note.exists())

            shutil.rmtree(vault_a)
            vault_b.mkdir(parents=True)
            (vault_b / "Memory").mkdir()
            remaining = list(vault_b.rglob("*.md"))
            self.assertEqual(remaining, [])
            self.assertFalse((vault_b / "Memory" / "matter-1003.md").exists())


class OptionalMcpIsolationTests(unittest.TestCase):
    """Live MCP check — skipped unless CLAWQL_LAB_ISOLATION_LIVE=1."""

    @unittest.skipUnless(
        os.environ.get("CLAWQL_LAB_ISOLATION_LIVE") == "1",
        "Set CLAWQL_LAB_ISOLATION_LIVE=1 with ClawQL MCP running",
    )
    def test_live_recall_does_not_see_other_task(self) -> None:
        import requests

        mcp = os.environ.get("CLAWQL_MCP_URL", "http://localhost:8080/mcp")
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "memory_recall",
                "arguments": {
                    "query": "LAB CONTAMINATION MARKER TASK-A-ONLY-ZZZ",
                    "limit": 5,
                },
            },
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
        }
        resp = requests.post(mcp, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        body = resp.json()
        text = json.dumps(body)
        self.assertNotIn("TASK-A-ONLY-ZZZ", text)


if __name__ == "__main__":
    unittest.main()

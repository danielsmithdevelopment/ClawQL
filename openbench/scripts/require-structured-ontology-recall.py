#!/usr/bin/env python3
"""Require a real memory_recall tool_use with schema + filters (B-7.1-ontology).

Scans OpenCode JSONL agent logs for a non-invalid tool_use whose input includes
schema (legal.Matter) and a filters object. Exit 0 on success, 1 on missing evidence.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _has_structured_input(inp: object) -> bool:
    if not isinstance(inp, dict):
        return False
    schema = str(inp.get("schema") or "").strip()
    filters = inp.get("filters")
    if schema != "legal.Matter":
        return False
    return isinstance(filters, dict) and len(filters) > 0


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: require-structured-ontology-recall.py AGENT_LOG", file=sys.stderr)
        return 2
    log_path = Path(sys.argv[1])
    text = (
        log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    )
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        part = obj.get("part")
        if not isinstance(part, dict):
            continue
        tool = part.get("tool")
        if not isinstance(tool, str) or tool == "invalid":
            continue
        if tool not in ("clawql_memory_recall", "memory_recall"):
            continue
        state = part.get("state")
        if isinstance(state, dict) and _has_structured_input(state.get("input")):
            return 0
        if _has_structured_input(part.get("input")):
            return 0
    print(
        "FAIL: missing real memory_recall tool_use with schema=legal.Matter and filters",
        flush=True,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Require *real* OpenCode tool_use rows for ClawQL tools.

OpenCode records unavailable tools as:
  {"type":"tool_use","part":{"tool":"invalid","state":{"input":{"tool":"clawql_…"}}}}

A naive grep for `"tool":"clawql_…"` matches that false positive and lets clawql-off
pass. This helper only counts `part.tool` when it is not `"invalid"`.

Usage:
  python3 require-real-clawql-tools.py AGENT_LOG \\
    'clawql_pageindex_build_tree|pageindex_build_tree' \\
    'clawql_pageindex_synthesize|pageindex_synthesize|…'

Each argv after the log is an OR-group (pipe-separated). All groups must match.
Exit 0 on success, 1 on missing evidence.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def real_tools(log_text: str) -> set[str]:
    found: set[str] = set()
    for line in log_text.splitlines():
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
        if isinstance(tool, str) and tool and tool != "invalid":
            found.add(tool)
    return found


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "usage: require-real-clawql-tools.py AGENT_LOG GROUP [GROUP…]",
            file=sys.stderr,
        )
        return 2
    log_path = Path(sys.argv[1])
    groups = sys.argv[2:]
    text = (
        log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    )
    found = real_tools(text)
    missing: list[str] = []
    for group in groups:
        alts = [a.strip() for a in group.split("|") if a.strip()]
        if not alts:
            continue
        if not any(a in found for a in alts):
            missing.append(group)
    if missing:
        print(f"FAIL: missing real tool_use for: {', '.join(missing)}", flush=True)
        print(f"found_tools={sorted(found)}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

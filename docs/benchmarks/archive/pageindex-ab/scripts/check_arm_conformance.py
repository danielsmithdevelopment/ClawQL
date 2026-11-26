#!/usr/bin/env python3
"""Check that a cell's tool-call trace only used the arm's allowed tools.

Exit 0 = conformant; exit 2 = violation (void + rerun, do not score as fail).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def normalize_tool(name: str) -> str:
    n = name.strip()
    for prefix in ("clawql_", "mcp_", "tool:"):
        if n.startswith(prefix):
            n = n[len(prefix) :]
    return n


def load_arm(path: Path, arm_id: str) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    arms = list(data.get("confirmatory_arms") or []) + list(data.get("diagnostic_arms") or [])
    # Backward compat with v0.1 flat "arms" key
    arms += list(data.get("arms") or [])
    by_id = {a["id"]: a for a in arms}
    if arm_id not in by_id:
        raise SystemExit(f"unknown arm {arm_id}")
    return by_id[arm_id]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--arm", required=True, help="Arm id from arms/arms.json")
    p.add_argument(
        "--arms-config",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "arms" / "arms.json",
    )
    p.add_argument(
        "--trace",
        type=Path,
        required=True,
        help="JSON with tool_calls: [{name: ...}, ...] or list of tool name strings",
    )
    args = p.parse_args()

    arm = load_arm(args.arms_config, args.arm)
    allowed = {normalize_tool(t) for t in arm.get("allowed_tools") or []}
    forbidden = {normalize_tool(t) for t in arm.get("forbidden_tools") or []}

    raw = json.loads(args.trace.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        names = [normalize_tool(x if isinstance(x, str) else x["name"]) for x in raw]
    else:
        calls = raw.get("tool_calls") or raw.get("tools") or []
        names = [normalize_tool(x if isinstance(x, str) else x["name"]) for x in calls]

    violations = []
    for n in names:
        if forbidden and n in forbidden:
            violations.append({"tool": n, "reason": "forbidden"})
        elif allowed and n not in allowed:
            violations.append({"tool": n, "reason": "not_allowed"})

    # Empty allowlist (e.g. whole-doc): any tool is a violation
    if not allowed and names:
        violations = [{"tool": n, "reason": "no_tools_arm"} for n in names]

    ok = len(violations) == 0
    print(
        json.dumps(
            {"ok": ok, "arm": args.arm, "tools_seen": names, "violations": violations},
            indent=2,
        )
    )
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())

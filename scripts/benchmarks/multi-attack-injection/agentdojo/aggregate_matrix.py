#!/usr/bin/env python3
"""Aggregate per-cell AgentDojo JSON reports into one board artifact."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "usage: aggregate_matrix.py <cells_glob_or_dir> <out.json>",
            file=sys.stderr,
        )
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    raw = sorted(src.glob("*.json")) if src.is_dir() else sorted(Path().glob(sys.argv[1]))
    cells = []
    for f in raw:
        try:
            payload = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            cells.append({"status": "error", "error": str(e), "path": str(f)})
            continue
        # Cell reports carry must_report / matrix_cell. Skip AgentDojo log
        # trajectories (injection_task_*.json, none.json) that share the dir.
        if "must_report" not in payload and "matrix_cell" not in payload:
            continue
        cells.append(payload)

    measured = [c for c in cells if c.get("status") == "measured"]
    rows = []
    for c in cells:
        mr = c.get("must_report") or {}
        rows.append(
            {
                "suite": (c.get("matrix_cell") or c.get("config") or {}).get("suite"),
                "defense": (c.get("matrix_cell") or c.get("config") or {}).get("defense")
                or (c.get("defense") or {}).get("id"),
                "model": (c.get("model") or {}).get("id"),
                "attack": (c.get("matrix_cell") or c.get("config") or {}).get("attack"),
                "status": c.get("status"),
                "agentdojo_asr": mr.get("agentdojo_asr"),
                "agentdojo_utility_under_attack": mr.get("agentdojo_utility_under_attack"),
                "n_pairs": mr.get("n_pairs"),
                "clawql_sink_blocks": (c.get("also_report") or {}).get("clawql_sink_blocks"),
            }
        )

    # Lead cell: clawql_data_flow on preferred model if present
    lead = next(
        (
            r
            for r in rows
            if r.get("status") == "measured" and r.get("defense") == "clawql_data_flow"
        ),
        next((r for r in rows if r.get("status") == "measured"), None),
    )

    report = {
        "kind": "multi_attack_injection_agentdojo_matrix_v1",
        "status": "measured" if measured else "incomplete",
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "upstream": {
            "name": "AgentDojo",
            "url": "https://github.com/ethz-spylab/agentdojo",
        },
        "must_report": {
            "agentdojo_asr": lead.get("agentdojo_asr") if lead else None,
            "agentdojo_utility_under_attack": (
                lead.get("agentdojo_utility_under_attack") if lead else None
            ),
            "lead_cell": lead,
            "note": "Lead row = first measured clawql_data_flow cell (else first measured). Full matrix in rows[].",
        },
        "rows": rows,
        "cells": cells,
        "n_cells": len(cells),
        "n_measured": len(measured),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out), "n_measured": len(measured), "rows": rows}, indent=2))
    return 0 if measured else 3


if __name__ == "__main__":
    raise SystemExit(main())

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
                "agentdojo_asr_ci95": mr.get("agentdojo_asr_ci95"),
                "agentdojo_utility_under_attack": mr.get("agentdojo_utility_under_attack"),
                "agentdojo_utility_under_attack_ci95": mr.get(
                    "agentdojo_utility_under_attack_ci95"
                ),
                "agentdojo_utility_without_attack": mr.get(
                    "agentdojo_utility_without_attack"
                ),
                "agentdojo_utility_without_attack_ci95": mr.get(
                    "agentdojo_utility_without_attack_ci95"
                ),
                "n_pairs": mr.get("n_pairs"),
                "claim_kind": mr.get("claim_kind", "empirical"),
                "clawql_sink_blocks": (c.get("also_report") or {}).get("clawql_sink_blocks"),
            }
        )

    # Lead: clawql_data_flow cell with the largest ASR drop vs matching none arm
    # (clearest defense signal). Fall back to first clawql, then any measured.
    def _none_asr(row: dict) -> float | None:
        for r in rows:
            if (
                r.get("status") == "measured"
                and r.get("defense") == "none"
                and r.get("model") == row.get("model")
                and r.get("suite") == row.get("suite")
                and isinstance(r.get("agentdojo_asr"), (int, float))
            ):
                return float(r["agentdojo_asr"])
        return None

    clawql_rows = [
        r
        for r in rows
        if r.get("status") == "measured" and r.get("defense") == "clawql_data_flow"
    ]
    lead = None
    best_delta = -1.0
    for r in clawql_rows:
        asr = r.get("agentdojo_asr")
        if not isinstance(asr, (int, float)):
            continue
        none_asr = _none_asr(r)
        delta = (none_asr - float(asr)) if none_asr is not None else -float(asr)
        if delta > best_delta:
            best_delta = delta
            lead = {
                **r,
                "none_arm_asr": none_asr,
                "asr_reduction_vs_none": delta if none_asr is not None else None,
            }
    if lead is None:
        lead = next(iter(clawql_rows), None) or next(
            (r for r in rows if r.get("status") == "measured"), None
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
            "agentdojo_asr_ci95": lead.get("agentdojo_asr_ci95") if lead else None,
            "agentdojo_utility_under_attack": (
                lead.get("agentdojo_utility_under_attack") if lead else None
            ),
            "agentdojo_utility_under_attack_ci95": (
                lead.get("agentdojo_utility_under_attack_ci95") if lead else None
            ),
            "agentdojo_utility_without_attack": (
                lead.get("agentdojo_utility_without_attack") if lead else None
            ),
            "agentdojo_utility_without_attack_ci95": (
                lead.get("agentdojo_utility_without_attack_ci95") if lead else None
            ),
            "lead_cell": lead,
            "claim_kind": "empirical",
            "note": (
                "Lead = clawql_data_flow cell with largest ASR drop vs matching none arm. "
                "Report ASR/utility with ci95; publish utility_without_attack alongside "
                "utility_under_attack. Empirical rates — not 'provable' security. "
                "CaMeL is related work (own models/numbers), not a same-table row until "
                "same-model head-to-head. Full matrix in rows[]."
            ),
        },
        "methodology_gates": {
            "bootstrap_ci_over_pairs": True,
            "utility_without_and_under_attack": True,
            "camel_same_model_required_for_table": True,
            "claim_vocabulary": "empirical_not_provable",
            "optional_cell_repeats": "MAI_AGENTDOJO_REPEATS (not default)",
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

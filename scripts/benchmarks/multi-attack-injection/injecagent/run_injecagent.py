#!/usr/bin/env python3
"""
InjecAgent held-out arm — protocol locked before v2 remeasure.

Runs AgentDojo's built-in ``injecagent`` attack (same FunctionsRuntime) with
``none`` vs ``clawql_data_flow`` arms. This is the OOS check that defaults were
not fitted only to ``important_instructions``. Never invents scores.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT_DEFAULT = (
    ROOT
    / "docs/benchmarks/security-suite/multi-attack-injection/results-injecagent.json"
)
AGENTDOJO_RUNNER = (
    ROOT / "scripts/benchmarks/multi-attack-injection/agentdojo/run_benchmark.py"
)
UPSTREAM = "https://github.com/uiuc-kang-lab/InjecAgent"
# Track the AgentDojo defaults id used for the clawql arm at measurement time.
DEFAULTS_ID = os.environ.get(
    "MAI_INJECAGENT_DEFAULTS_ID", "clawql_agentdojo_defaults_v3"
)


def _run_cell(defense: str, suite: str, model: str, out: Path, logdir: Path) -> dict:
    env = os.environ.copy()
    env.update(
        {
            "MAI_AGENTDOJO": "1",
            "MAI_AGENTDOJO_SUITE": suite,
            "MAI_AGENTDOJO_DEFENSE": defense,
            "MAI_AGENTDOJO_MODEL": model,
            "MAI_AGENTDOJO_ATTACK": "injecagent",
            "MAI_AGENTDOJO_FORCE": "1",
            "MAI_AGENTDOJO_OUT": str(out),
            "MAI_AGENTDOJO_LOGDIR": str(logdir),
        }
    )
    proc = subprocess.run(
        [sys.executable, str(AGENTDOJO_RUNNER)],
        env=env,
        capture_output=True,
        text=True,
    )
    cell: dict = {"defense": defense, "exit_code": proc.returncode}
    if out.exists():
        try:
            cell["report"] = json.loads(out.read_text())
        except json.JSONDecodeError as e:
            cell["parse_error"] = str(e)
    else:
        cell["stdout_tail"] = (proc.stdout or "")[-2000:]
        cell["stderr_tail"] = (proc.stderr or "")[-2000:]
    return cell


def main() -> int:
    out = Path(os.environ.get("MAI_INJECAGENT_OUT", str(OUT_DEFAULT)))
    model = os.environ.get("MAI_INJECAGENT_MODEL", "openai/gpt-4o-mini")
    suite = os.environ.get("MAI_INJECAGENT_SUITE", "slack")
    enabled = os.environ.get("MAI_INJECAGENT", "0") == "1"
    has_key = bool(os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY"))

    base = {
        "kind": "multi_attack_injection_injecagent_v1",
        "defaults_id": DEFAULTS_ID,
        "upstream": {
            "name": "InjecAgent (via AgentDojo attack=injecagent)",
            "url": UPSTREAM,
            "agentdojo_attack": "injecagent",
        },
        "protocol": {
            "role": "out_of_sample_held_out",
            "tuned_on_agentdojo_important_instructions": False,
            "named_before_remeasure": True,
            "model": model,
            "suite": suite,
            "doc": "docs/benchmarks/security-suite/multi-attack-injection/INJECAGENT.md",
        },
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "claim_kind": "empirical",
    }

    if not enabled:
        report = {
            **base,
            "status": "pending_enable",
            "note": "Set MAI_INJECAGENT=1 to run. Protocol is frozen; no scores invented.",
        }
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 0

    if not has_key:
        report = {
            **base,
            "status": "skipped_no_api_key",
            "note": "OPENROUTER_API_KEY / OPENAI_API_KEY missing — no invented InjecAgent scores.",
        }
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 0

    work = Path(os.environ.get("MAI_INJECAGENT_WORK", "/tmp/mai-injecagent"))
    work.mkdir(parents=True, exist_ok=True)
    cells = []
    for defense in ("none", "clawql_data_flow"):
        cell_out = work / f"{suite}__{defense}.json"
        logdir = work / f"logs-{defense}"
        logdir.mkdir(parents=True, exist_ok=True)
        cells.append(_run_cell(defense, suite, model, cell_out, logdir))

    rows = []
    for cell in cells:
        rep = cell.get("report") or {}
        suites = (rep.get("suites") or {}) if isinstance(rep, dict) else {}
        s = suites.get(suite) or {}
        mc = rep.get("matrix_cell") or {}
        asr = (
            s.get("targeted_asr")
            or mc.get("agentdojo_asr")
            or rep.get("agentdojo_asr")
            or (rep.get("summary") or {}).get("targeted_asr")
        )
        util_u = (
            s.get("utility_under_attack")
            or mc.get("agentdojo_utility_under_attack")
            or rep.get("agentdojo_utility_under_attack")
        )
        util_c = (
            s.get("utility_without_attack")
            or mc.get("agentdojo_utility_without_attack")
            or rep.get("agentdojo_utility_without_attack")
        )
        n_pairs = (
            s.get("n_pairs")
            or mc.get("n_pairs")
            or (rep.get("summary") or {}).get("n_pairs")
        )
        rows.append(
            {
                "defense": cell["defense"],
                "exit_code": cell["exit_code"],
                "agentdojo_asr": asr,
                "agentdojo_utility_under_attack": util_u,
                "agentdojo_utility_without_attack": util_c,
                "n_pairs": n_pairs,
            }
        )

    measured = all(r.get("agentdojo_asr") is not None for r in rows)
    report = {
        **base,
        "status": "measured" if measured else "error_incomplete",
        "rows": rows,
        "cells_raw": [
            {k: v for k, v in c.items() if k != "report"} | {"has_report": "report" in c}
            for c in cells
        ],
        "note": (
            "AgentDojo attack=injecagent equal-arm vs none. Not a table peer to "
            "important_instructions pooled ASR — OOS only."
            if measured
            else "One or more cells missing ASR — see cells_raw / workdir logs."
        ),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if measured else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
InjecAgent held-out arm — protocol locked before v2 remeasure.

Clones / uses upstream InjecAgent when available and OPENROUTER_API_KEY is set.
Never invents scores. Does not change clawql_agentdojo_defaults_v2.
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
UPSTREAM = "https://github.com/uiuc-kang-lab/InjecAgent.git"
DEFAULTS_ID = "clawql_agentdojo_defaults_v2"


def main() -> int:
    out = Path(os.environ.get("MAI_INJECAGENT_OUT", str(OUT_DEFAULT)))
    model = os.environ.get("MAI_INJECAGENT_MODEL", "openai/gpt-4o-mini")
    enabled = os.environ.get("MAI_INJECAGENT", "0") == "1"
    has_key = bool(os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY"))

    base = {
        "kind": "multi_attack_injection_injecagent_v1",
        "defaults_id": DEFAULTS_ID,
        "upstream": {"name": "InjecAgent", "url": UPSTREAM},
        "protocol": {
            "role": "out_of_sample_held_out",
            "tuned_on_agentdojo": False,
            "named_before_remeasure": True,
            "model": model,
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

    cache = Path(os.environ.get("MAI_INJECAGENT_CACHE", "/tmp/injecagent-upstream"))
    if not (cache / ".git").exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", UPSTREAM, str(cache)],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as e:
            report = {
                **base,
                "status": "error",
                "error": f"clone_failed: {e.stderr[-2000:] if e.stderr else e}",
                "note": "Live run failed — no invented scores.",
            }
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report, indent=2))
            return 1

    # Full InjecAgent eval wiring is environment-specific; record readiness + next step.
    report = {
        **base,
        "status": "harness_ready_awaiting_eval_wire",
        "upstream_checkout": str(cache),
        "note": (
            "Upstream cloned. Wire AgentDojo-style none vs clawql_data_flow arms to "
            "InjecAgent's tool-agent loop in a follow-up commit once the eval entrypoint "
            "is confirmed; do not invent ASR/utility."
        ),
        "next": "Confirm InjecAgent run script + apply clawql_tools_executor policy at tool boundary.",
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

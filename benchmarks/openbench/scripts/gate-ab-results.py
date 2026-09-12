#!/usr/bin/env python3
"""Fail the OpenBench A/B job unless the on-arm succeeds and scores ≥ off."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    task = os.environ.get("OPENBENCH_TASK")
    if not task:
        print("::error::OPENBENCH_TASK is required", flush=True)
        return 2
    out = Path(f"artifacts/openbench-ab/{task}/results.json")
    if not out.is_file():
        print(f"::error::missing results.json at {out}", flush=True)
        return 2
    report = json.loads(out.read_text(encoding="utf-8"))
    summary = report.get("summary") or {}
    arms = report.get("arms") or []
    on = summary.get("clawql-on") or summary.get("ouroboros-on") or {}
    off = summary.get("clawql-off") or summary.get("ouroboros-off") or {}
    on_score = float(on.get("mean_score") or 0.0)
    off_score = float(off.get("mean_score") or 0.0)
    on_ok = int(on.get("successes") or 0)
    if "clawql-on" not in arms and "ouroboros-on" not in arms:
        print("OpenBench gate skipped (no on-arm in matrix)", flush=True)
        return 0
    if on_ok < 1:
        print(
            f"::error::OpenBench gate — on-arm successes={on_ok} (need ≥1); "
            f"on_score={on_score} off_score={off_score}",
            flush=True,
        )
        return 1
    if on_score + 1e-9 < off_score:
        print(
            f"::error::OpenBench gate — on_score={on_score} < off_score={off_score}",
            flush=True,
        )
        return 1
    print(
        f"OpenBench gate OK — on_score={on_score} >= off_score={off_score} successes={on_ok}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

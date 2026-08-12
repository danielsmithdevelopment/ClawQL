#!/usr/bin/env python3
"""Aggregate per-task Harvey LAB scorecards into a sweep summary.

Usage:
  python integrations/harvey-labs/scripts/aggregate-lab-scorecards.py \\
    --artifacts-root /tmp/lab-artifacts \\
    --out integrations/harvey-labs/results/sweep-summary.json
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


def _load_scorecards(root: Path) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for path in sorted(root.rglob("scorecard-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict) or "arms" not in data:
            continue
        data["_source"] = str(path)
        cards.append(data)
    return cards


def _mean(xs: list[float]) -> float | None:
    return statistics.fmean(xs) if xs else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts-root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--mode", default="")
    ap.add_argument("--task-count", type=int, default=0)
    ap.add_argument("--judge-model", default="")
    ap.add_argument("--nemotron-model", default="")
    args = ap.parse_args()

    cards = _load_scorecards(args.artifacts_root)
    by_arm: dict[str, list[dict[str, Any]]] = defaultdict(list)
    tasks_seen: set[str] = set()

    for card in cards:
        task = str(card.get("task") or "")
        if task:
            tasks_seen.add(task)
        arms = card.get("arms") or {}
        if not isinstance(arms, dict):
            continue
        for arm, row in arms.items():
            if not isinstance(row, dict):
                continue
            entry = dict(row)
            entry["task"] = task
            by_arm[str(arm)].append(entry)

    summary_arms: dict[str, Any] = {}
    for arm, rows in sorted(by_arm.items()):
        cprs = [float(r["criterion_pass_rate"]) for r in rows if r.get("criterion_pass_rate") is not None]
        alls = [float(r["all_pass"]) for r in rows if r.get("all_pass") is not None]
        turns = [int(r["turns"]) for r in rows if isinstance(r.get("turns"), int)]
        ins = [int(r["input_tokens"]) for r in rows if isinstance(r.get("input_tokens"), int)]
        outs = [int(r["output_tokens"]) for r in rows if isinstance(r.get("output_tokens"), int)]
        n_all = sum(1 for a in alls if a >= 1.0)
        summary_arms[arm] = {
            "n_tasks": len(rows),
            "mean_criterion_pass_rate": _mean(cprs),
            "mean_all_pass": _mean(alls),
            "all_pass_count": n_all,
            "all_pass_rate": (n_all / len(rows)) if rows else None,
            "mean_turns": _mean([float(t) for t in turns]),
            "sum_input_tokens": sum(ins) if ins else None,
            "sum_output_tokens": sum(outs) if outs else None,
            "tasks": sorted({str(r.get("task")) for r in rows if r.get("task")}),
            "per_task": sorted(rows, key=lambda r: str(r.get("task") or "")),
        }

    out = {
        "mode": args.mode,
        "task_count_requested": args.task_count,
        "tasks_scored": sorted(tasks_seen),
        "n_tasks_scored": len(tasks_seen),
        "n_scorecards": len(cards),
        "judge_model": args.judge_model,
        "nemotron_model": args.nemotron_model,
        "arms": summary_arms,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in out if k != "arms"}, indent=2))
    for arm, s in summary_arms.items():
        print(
            f"arm={arm} n={s['n_tasks']} mean_cpr={s['mean_criterion_pass_rate']} "
            f"all_pass_rate={s['all_pass_rate']} mean_turns={s['mean_turns']}"
        )


if __name__ == "__main__":
    main()

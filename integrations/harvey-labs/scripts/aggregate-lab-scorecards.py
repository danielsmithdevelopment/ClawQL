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


def _median(xs: list[float]) -> float | None:
    return float(statistics.median(xs)) if xs else None


def _p90(xs: list[float]) -> float | None:
    if not xs:
        return None
    ordered = sorted(xs)
    idx = min(len(ordered) - 1, max(0, int(round(0.9 * (len(ordered) - 1)))))
    return float(ordered[idx])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts-root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--mode", default="")
    ap.add_argument("--task-count", type=int, default=0)
    ap.add_argument("--judge-model", default="")
    ap.add_argument("--nemotron-model", default="")
    ap.add_argument(
        "--turn-ceiling",
        type=int,
        default=40,
        help="Treat turns >= this as hitting the agent turn ceiling",
    )
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
            turns = entry.get("turns")
            all_pass = float(entry.get("all_pass") or 0.0)
            if isinstance(turns, int) and turns >= args.turn_ceiling:
                entry["hit_turn_ceiling"] = True
            else:
                entry["hit_turn_ceiling"] = False
            # Graded failure: finished under ceiling but not all-pass
            entry["graded_fail"] = bool(
                all_pass < 1.0 and not entry["hit_turn_ceiling"]
            )
            by_arm[str(arm)].append(entry)

    summary_arms: dict[str, Any] = {}
    for arm, rows in sorted(by_arm.items()):
        cprs = [
            float(r["criterion_pass_rate"])
            for r in rows
            if r.get("criterion_pass_rate") is not None
        ]
        alls = [float(r["all_pass"]) for r in rows if r.get("all_pass") is not None]
        turns = [int(r["turns"]) for r in rows if isinstance(r.get("turns"), int)]
        turn_f = [float(t) for t in turns]
        ins = [
            int(r["input_tokens"])
            for r in rows
            if isinstance(r.get("input_tokens"), int)
        ]
        outs = [
            int(r["output_tokens"])
            for r in rows
            if isinstance(r.get("output_tokens"), int)
        ]
        n_all = sum(1 for a in alls if a >= 1.0)
        ceiling_hits = [r for r in rows if r.get("hit_turn_ceiling")]
        graded_fails = [r for r in rows if r.get("graded_fail")]
        fails = [r for r in rows if float(r.get("all_pass") or 0.0) < 1.0]
        summary_arms[arm] = {
            "n_tasks": len(rows),
            "mean_criterion_pass_rate": _mean(cprs),
            "mean_all_pass": _mean(alls),
            "all_pass_count": n_all,
            "all_pass_rate": (n_all / len(rows)) if rows else None,
            "mean_turns": _mean(turn_f),
            "median_turns": _median(turn_f),
            "p90_turns": _p90(turn_f),
            "turn_ceiling": args.turn_ceiling,
            "turn_ceiling_hit_count": len(ceiling_hits),
            "turn_ceiling_hit_rate": (len(ceiling_hits) / len(rows)) if rows else None,
            "graded_fail_count": len(graded_fails),
            "fail_tasks": sorted(
                {str(r.get("task")) for r in fails if r.get("task")}
            ),
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
        "harvey_parity_notes": {
            "judge": "claude-sonnet-4-6 matches Harvey harness default JUDGE_MODELS",
            "routing": "OpenRouter for this sweep; direct Anthropic preferred for final provenance",
        },
        "arms": summary_arms,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in out if k != "arms"}, indent=2))
    for arm, s in summary_arms.items():
        print(
            f"arm={arm} n={s['n_tasks']} mean_cpr={s['mean_criterion_pass_rate']} "
            f"all_pass_rate={s['all_pass_rate']} median_turns={s['median_turns']} "
            f"p90_turns={s['p90_turns']} ceiling_hits={s['turn_ceiling_hit_count']} "
            f"graded_fails={s['graded_fail_count']}"
        )


if __name__ == "__main__":
    main()

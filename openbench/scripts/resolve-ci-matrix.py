#!/usr/bin/env python3
"""Resolve OpenBench CI task matrix from openbench/ci-matrix.json.

Usage:
  python3 openbench/scripts/resolve-ci-matrix.py --mode pr
  python3 openbench/scripts/resolve-ci-matrix.py --mode dispatch --task all
  python3 openbench/scripts/resolve-ci-matrix.py --mode dispatch --task cache-scratch-handoff
  python3 openbench/scripts/resolve-ci-matrix.py --mode dispatch --task all-including-retired

Prints a JSON array of task names to stdout (for GITHUB_OUTPUT).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "openbench" / "ci-matrix.json"
TASKS_DIR = ROOT / "openbench" / "tasks"


def load_matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def discovered_tasks() -> list[str]:
    if not TASKS_DIR.is_dir():
        return []
    out: list[str] = []
    for child in sorted(TASKS_DIR.iterdir()):
        if child.is_dir() and (child / "instruction.md").is_file() and (child / "checker.sh").is_file():
            out.append(child.name)
    return out


def all_known(cfg: dict) -> list[str]:
    """Union of pr_active + retired + on-disk tasks (stable order)."""
    names: list[str] = []
    seen: set[str] = set()
    for name in list(cfg.get("pr_active") or []) + sorted((cfg.get("retired") or {}).keys()) + discovered_tasks():
        if name not in seen:
            seen.add(name)
            names.append(name)
    return names


def resolve(mode: str, task: str | None) -> list[str]:
    cfg = load_matrix()
    active = list(cfg.get("pr_active") or [])
    retired = dict(cfg.get("retired") or {})
    known = set(all_known(cfg))

    if mode == "pr":
        return [t for t in active if t in known or (TASKS_DIR / t).is_dir()]

    if mode != "dispatch":
        raise SystemExit(f"unknown mode: {mode}")

    t = (task or "all").strip()
    if t in ("", "all", "active"):
        return [x for x in active if (TASKS_DIR / x).is_dir()]
    if t == "all-including-retired":
        # Active first, then remaining known tasks (incl. retired).
        ordered = list(active)
        for name in all_known(cfg):
            if name not in ordered and name != "ouroboros-oscillation-escape":
                # Ouroboros has its own workflow; keep out of clawql on/off matrix.
                if name in retired or (TASKS_DIR / name).is_dir():
                    if name.startswith("ouroboros-"):
                        continue
                    ordered.append(name)
        return [x for x in ordered if (TASKS_DIR / x).is_dir()]
    if t not in known and not (TASKS_DIR / t).is_dir():
        raise SystemExit(f"unknown task: {t}")
    return [t]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mode", choices=("pr", "dispatch"), required=True)
    p.add_argument("--task", default="all", help="For dispatch: task name, all, or all-including-retired")
    p.add_argument("--github-output", action="store_true", help="Also write tasks=… to $GITHUB_OUTPUT")
    args = p.parse_args()

    tasks = resolve(args.mode, args.task)
    payload = json.dumps(tasks)
    print(payload)
    if args.github_output:
        out = Path(__import__("os").environ.get("GITHUB_OUTPUT", "/dev/null"))
        with out.open("a", encoding="utf-8") as fh:
            fh.write(f"tasks={payload}\n")
            fh.write(f"has_tasks={'true' if tasks else 'false'}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

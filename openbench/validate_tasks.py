#!/usr/bin/env python3
"""Validate ClawQL OpenBench task checkers (fail-on-workspace / pass-on-solution).

Mirrors the OpenBench contract from minghinmatthewlam/openbench CONTRIBUTING-TASKS.md
without importing the full obench package. Standard library only.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
CHECKER_TIMEOUT_S = 120


def parse_score(output: str):
    score = None
    for line in (output or "").splitlines():
        stripped = line.strip()
        if not stripped.startswith("SCORE:"):
            continue
        try:
            val = float(stripped[len("SCORE:") :].strip())
        except ValueError:
            continue
        score = max(0.0, min(1.0, val))
    return score


def effective_score(exit_code: int, parsed_score):
    if exit_code == 0:
        return 1.0
    if parsed_score is not None:
        return parsed_score
    return 0.0


def materialize(task_dir: Path, dest: Path, overlay_solution: bool) -> None:
    workspace = task_dir / "workspace"
    if not workspace.is_dir():
        raise FileNotFoundError(f"missing workspace/: {workspace}")
    for item in workspace.iterdir():
        target = dest / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    if overlay_solution:
        solution = task_dir / "solution"
        if solution.is_dir():
            for path in solution.rglob("*"):
                if path.is_file():
                    rel = path.relative_to(solution)
                    target = dest / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, target)


def run_checker(task_dir: Path, overlay_solution: bool):
    checker = task_dir / "checker.sh"
    if not checker.is_file():
        return 99, "missing checker.sh\n", None

    tmp = Path(tempfile.mkdtemp(prefix="clawql-taskcheck-"))
    try:
        try:
            materialize(task_dir, tmp, overlay_solution)
        except Exception as exc:  # noqa: BLE001
            return 99, f"materialize failed: {exc}\n", None

        env = dict(os.environ)
        env["TASK_DIR"] = str(task_dir)

        try:
            proc = subprocess.run(
                ["bash", str(checker)],
                cwd=str(tmp),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=CHECKER_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired as exc:
            out = exc.stdout or ""
            if isinstance(out, bytes):
                out = out.decode("utf-8", "replace")
            return 124, out + "\n[timeout]\n", parse_score(out)

        return proc.returncode, proc.stdout or "", parse_score(proc.stdout or "")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def discover_tasks(root: Path):
    tasks = []
    if not root.is_dir():
        return tasks
    for child in sorted(root.iterdir()):
        if child.is_dir() and (child / "checker.sh").is_file() and (child / "workspace").is_dir():
            tasks.append(child)
    return tasks


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tasks-dir",
        type=Path,
        default=TASKS_DIR,
        help="Directory containing task folders (default: openbench/tasks)",
    )
    args = parser.parse_args(argv)

    tasks = discover_tasks(args.tasks_dir)
    if not tasks:
        print(f"No tasks found under {args.tasks_dir}", file=sys.stderr)
        return 1

    failed = 0
    print(f"{'task':<36} {'workspace':<14} {'solution':<14} {'result'}")
    print("-" * 80)
    for task in tasks:
        ws_code, ws_out, ws_score = run_checker(task, overlay_solution=False)
        sol_code, sol_out, sol_score = run_checker(task, overlay_solution=True)
        ws_eff = effective_score(ws_code, ws_score)
        sol_eff = effective_score(sol_code, sol_score)

        ws_ok = ws_code != 0
        sol_ok = sol_code == 0 and sol_eff == 1.0
        ok = ws_ok and sol_ok
        if not ok:
            failed += 1

        ws_label = f"FAIL(ok:{ws_eff:.2f})" if ws_ok else f"PASS(bad:{ws_eff:.2f})"
        sol_label = f"PASS(ok:{sol_eff:.2f})" if sol_ok else f"FAIL(bad:{sol_eff:.2f})"
        print(f"{task.name:<36} {ws_label:<14} {sol_label:<14} {'PASS' if ok else 'FAIL'}")
        if not ok:
            if not ws_ok:
                print(f"  workspace checker output:\n{ws_out[-800:]}", file=sys.stderr)
            if not sol_ok:
                print(f"  solution checker output:\n{sol_out[-800:]}", file=sys.stderr)

    print("-" * 80)
    if failed:
        print(f"{failed}/{len(tasks)} task(s) failed validation", file=sys.stderr)
        return 1
    print(f"All {len(tasks)} task(s) validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

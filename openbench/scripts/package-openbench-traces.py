#!/usr/bin/env python3
"""Package OpenBench inference call-store traces + grader labels for fine-tuning.

GitHub Actions runners are ephemeral. ``clawql inference serve`` writes
``InferenceRecord`` JSONL when ``CLAWQL_INFERENCE_STORE=jsonl`` and
``CLAWQL_INFERENCE_STORE_PATH`` point at a workspace path. This script:

1. Confirms / summarizes the call-store JSONL under an artifact directory
2. Writes ``trace-session-labels.json`` joining OpenBench grader scores
   (from ``results.json``) so export/join pipelines can filter later

Per-record ``evaluatorVerdict`` on call-store rows stays ``none`` until
arm-scoped correlation/team tagging lands — collection still captures the
raw trajectories; labels live in the sidecar.

Usage::

  python3 openbench/scripts/package-openbench-traces.py \\
    --artifact-dir artifacts/openbench-ab/search-first-discovery \\
    --run-id 123 --task search-first-discovery
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "clawql.openbench.trace-session-labels.v1"


def _rel_to(base: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(base.resolve()))
    except ValueError:
        return str(path)


def count_jsonl_records(path: Path) -> int:
    if not path.is_file():
        return 0
    n = 0
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                n += 1
    return n


def arm_labels_from_results(results: dict[str, Any]) -> list[dict[str, Any]]:
    summary = results.get("summary") or {}
    trials = results.get("trials_detail") or []
    by_arm: dict[str, list[dict[str, Any]]] = {}
    for trial in trials:
        if not isinstance(trial, dict):
            continue
        arm = str(trial.get("arm") or "").strip()
        if not arm:
            continue
        checker = trial.get("checker") or {}
        score = checker.get("score")
        if score is None and isinstance(checker, dict):
            score = checker.get("SCORE")
        by_arm.setdefault(arm, []).append(
            {
                "trial": trial.get("trial"),
                "score": score,
                "checker_ok": checker.get("ok") if isinstance(checker, dict) else None,
                "agent_completed": (trial.get("agent") or {}).get("completed"),
                "wall_s": (trial.get("agent") or {}).get("wall_s"),
                "turns": (trial.get("agent") or {}).get("turns"),
            }
        )

    labels: list[dict[str, Any]] = []
    arms = sorted(set(list(summary.keys()) + list(by_arm.keys())))
    for arm in arms:
        arm_sum = summary.get(arm) if isinstance(summary.get(arm), dict) else {}
        mean = arm_sum.get("mean_score")
        success_rate = arm_sum.get("success_rate")
        # Map grader success to export-style verdict for the *arm session*,
        # not yet stamped onto each InferenceRecord.
        if mean is None and success_rate is None:
            verdict = "none"
        elif (mean is not None and float(mean) >= 0.99) or (
            success_rate is not None and float(success_rate) >= 0.99
        ):
            verdict = "passed"
        elif (mean is not None and float(mean) <= 0.01) or (
            success_rate is not None and float(success_rate) <= 0.01
        ):
            verdict = "failed"
        else:
            verdict = "partial"
        labels.append(
            {
                "arm": arm,
                "grader_verdict": verdict,
                "mean_score": mean,
                "success_rate": success_rate,
                "n": arm_sum.get("n"),
                "trials": by_arm.get(arm, []),
            }
        )
    return labels


def build_session_labels(
    *,
    artifact_dir: Path,
    results: dict[str, Any] | None,
    call_store_path: Path,
    record_count: int,
    run_id: str | None,
    task: str | None,
    model: str | None,
) -> dict[str, Any]:
    task_name = task or (results or {}).get("task") or artifact_dir.name
    return {
        "schema": SCHEMA,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "github_run_id": run_id or os.environ.get("GITHUB_RUN_ID"),
        "github_run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "github_sha": os.environ.get("GITHUB_SHA") or (results or {}).get("git_sha"),
        "github_ref": os.environ.get("GITHUB_REF"),
        "task": task_name,
        "model": model or (results or {}).get("model"),
        "arms": (results or {}).get("arms"),
        "trials": (results or {}).get("trials"),
        "call_store": {
            "path": str(call_store_path),
            "relative": _rel_to(artifact_dir, call_store_path),
            "record_count": record_count,
            "note": (
                "Records keep evaluatorVerdict=none until arm-scoped tagging; "
                "use arm_labels.grader_verdict for session-level training filters."
            ),
        },
        "arm_labels": arm_labels_from_results(results or {}),
        "results_summary": (results or {}).get("summary"),
        "export_hint": (
            "clawql inference export --output dataset.jsonl "
            f"(set CLAWQL_INFERENCE_STORE_PATH={call_store_path})"
        ),
    }


def package(
    artifact_dir: Path,
    *,
    run_id: str | None = None,
    task: str | None = None,
    model: str | None = None,
    call_store: Path | None = None,
) -> dict[str, Any]:
    artifact_dir = artifact_dir.resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    store_path = call_store or Path(
        os.environ.get(
            "CLAWQL_INFERENCE_STORE_PATH",
            str(artifact_dir / "call-store" / "calls.jsonl"),
        )
    )
    if not store_path.is_absolute():
        store_path = (Path.cwd() / store_path).resolve()

    # Prefer workspace-relative store under artifact_dir when env points elsewhere empty
    default_under_artifact = artifact_dir / "call-store" / "calls.jsonl"
    if not store_path.is_file() and default_under_artifact.is_file():
        store_path = default_under_artifact

    store_path.parent.mkdir(parents=True, exist_ok=True)
    record_count = count_jsonl_records(store_path)

    results_path = artifact_dir / "results.json"
    results: dict[str, Any] | None = None
    if results_path.is_file():
        results = json.loads(results_path.read_text(encoding="utf-8"))

    labels = build_session_labels(
        artifact_dir=artifact_dir,
        results=results,
        call_store_path=store_path,
        record_count=record_count,
        run_id=run_id,
        task=task,
        model=model,
    )
    out_path = artifact_dir / "trace-session-labels.json"
    out_path.write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")

    # Small human-readable pointer for artifact browsers
    readme = artifact_dir / "call-store" / "README.md"
    readme.parent.mkdir(parents=True, exist_ok=True)
    readme.write_text(
        "\n".join(
            [
                "# OpenBench inference call store",
                "",
                f"- Records: **{record_count}** in `{store_path.name}`",
                f"- Session labels: `../trace-session-labels.json`",
                f"- Task: `{labels.get('task')}`",
                f"- GitHub run: `{labels.get('github_run_id')}`",
                "",
                "Set `CLAWQL_INFERENCE_STORE=jsonl` and",
                f"`CLAWQL_INFERENCE_STORE_PATH` to this JSONL, then run",
                "`clawql inference export --output …`.",
                "",
                "See `docs/benchmarks/openbench-trace-collection.md`.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return labels


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        required=True,
        help="Directory uploaded as the OpenBench job artifact",
    )
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--task", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument(
        "--call-store",
        type=Path,
        default=None,
        help="Override path to calls.jsonl (default: CLAWQL_INFERENCE_STORE_PATH or artifact/call-store/calls.jsonl)",
    )
    args = parser.parse_args(argv)

    labels = package(
        args.artifact_dir,
        run_id=args.run_id,
        task=args.task,
        model=args.model,
        call_store=args.call_store,
    )
    count = labels["call_store"]["record_count"]
    print(
        f"packaged traces: records={count} "
        f"labels={args.artifact_dir}/trace-session-labels.json"
    )
    if count == 0:
        print(
            "warning: call store empty — ensure CLAWQL_INFERENCE_STORE=jsonl "
            "and CLAWQL_INFERENCE_STORE_PATH were set before inference serve",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

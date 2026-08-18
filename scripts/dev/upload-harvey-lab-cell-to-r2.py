#!/usr/bin/env python3
"""Upload one Harvey LAB cell (or sweep summary) to Cloudflare R2.

Same prefix as the one-off harvest:

  raw/harvey-lab/YYYY/MM/DD/run-<run_id>/<arm>/<task_id>/

GHA: fail if Cloudflare credentials are missing (corpus of record).
Local: pass --allow-missing-r2 so Mac runs still work without CF env.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# scripts/dev is not a package; load sibling helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from harvey_lab_r2 import (  # noqa: E402
    normalize_task_id,
    r2_credentials,
    upload_cell_dir,
    utc_day,
)


def _call_stores(paths: list[str]) -> list[Path]:
    out: list[Path] = []
    seen: set[str] = set()
    for raw in paths:
        path = Path(raw).expanduser()
        if not path.is_file():
            continue
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--arm", required=True, help="nemotron, nemotron-clawql, _other, …")
    parser.add_argument("--task-id", required=True, help="009 or firm-knowledge/tasks/009")
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID") or "local")
    parser.add_argument("--source", default="gha", choices=("gha", "local", "harvest"))
    parser.add_argument("--other-name", default="", help="If set, upload under _other/<name> (sweep summary)")
    parser.add_argument("--call-store", action="append", default=[], help="Optional clawql-inference JSONL")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--allow-missing-r2",
        action="store_true",
        help="Exit 0 with a warning when Cloudflare credentials are absent",
    )
    args = parser.parse_args()

    token, account, bucket = r2_credentials()
    if not args.dry_run and (not token or not account):
        msg = (
            "CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases) "
            f"required to persist Harvey LAB traces to R2 (bucket {bucket})"
        )
        if args.allow_missing_r2:
            print(f"warn: {msg} — skipping durable upload", file=sys.stderr, flush=True)
            return 0
        print(f"error: {msg}", file=sys.stderr)
        return 1

    if not args.other_name:
        try:
            task_id = normalize_task_id(args.task_id)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        task_id = args.task_id or "000"

    results = Path(args.results_dir)
    try:
        upload_cell_dir(
            results,
            arm=args.arm,
            task_id=task_id,
            run_id=str(args.run_id),
            source=args.source,
            extra_files=_call_stores(args.call_store),
            dry_run=args.dry_run,
            day=utc_day(),
            other_name=args.other_name or None,
        )
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Upload local Harvey LAB harness cells to Cloudflare R2.

Discovers unique ``transcript.jsonl`` run directories (retries kept as
separate cells) and writes the same prefix layout as the GHA harvest:

  raw/harvey-lab/YYYY/MM/DD/run-local-<task>-<harnessRunId>/<arm>/<task_id>/

Does not attach the shared clawql-inference call-store (it mixes campaigns
and can be 100MB+). Repo last-copy dirs (``*-local/``) are skipped — they
overwrite to the last task and are not extra traces.

Auth: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases).
If account is unset, falls back to website/wrangler.jsonc ``account_id``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harvey_lab_r2 import (  # noqa: E402
    DEFAULT_BUCKET,
    env_first,
    r2_credentials,
    r2_put,
    upload_cell_dir,
)

HARNESS_RUN_RE = re.compile(r"^20\d{6}-\d{6}$")
DEFAULT_RESULTS = Path("/tmp/harvey-labs-work2/harvey-labs/results/firm-knowledge/tasks")
WRANGLER_ACCOUNT_RE = re.compile(r'"account_id"\s*:\s*"([a-f0-9]{32})"', re.I)


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE from a dotenv file without overriding existing env."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def default_account_from_wrangler(clawql_root: Path) -> str | None:
    wrangler = clawql_root / "website" / "wrangler.jsonc"
    if not wrangler.is_file():
        return None
    match = WRANGLER_ACCOUNT_RE.search(wrangler.read_text(encoding="utf-8"))
    return match.group(1) if match else None


def infer_arm(config_path: Path) -> str:
    if not config_path.is_file():
        return "nemotron-clawql"
    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "nemotron-clawql"
    model = str(cfg.get("model") or "")
    if model.startswith("clawql-cc/") or "clawql" in model.lower():
        return "nemotron-clawql"
    return "nemotron"


def day_from_harness_run(run_id: str) -> str:
    # 20260816-195438 → 2026/08/16
    stamp = run_id.split("-", 1)[0]
    return f"{stamp[0:4]}/{stamp[4:6]}/{stamp[6:8]}"


def discover_cells(results_root: Path, *, latest_only: bool) -> list[dict]:
    cells: list[dict] = []
    if not results_root.is_dir():
        return cells
    by_task: dict[str, list[dict]] = {}
    for transcript in sorted(results_root.glob("*/*/20*/transcript.jsonl")):
        rundir = transcript.parent
        harness_run = rundir.name
        if not HARNESS_RUN_RE.match(harness_run):
            continue
        model_dir = rundir.parent
        task_dir = model_dir.parent
        task_id = task_dir.name
        if not re.fullmatch(r"\d{3}", task_id):
            continue
        cell = {
            "task_id": task_id,
            "arm": infer_arm(rundir / "config.json"),
            "harness_run_id": harness_run,
            "results_dir": str(rundir),
            "transcript_bytes": transcript.stat().st_size,
            "day": day_from_harness_run(harness_run),
            "r2_run_id": f"local-{task_id}-{harness_run}",
        }
        by_task.setdefault(task_id, []).append(cell)
        cells.append(cell)
    if not latest_only:
        return cells
    latest: list[dict] = []
    for task_id in sorted(by_task):
        latest.append(max(by_task[task_id], key=lambda c: c["harness_run_id"]))
    return latest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--results-root",
        default=str(DEFAULT_RESULTS),
        help="firm-knowledge/tasks directory with <task>/<model>/<run>/transcript.jsonl",
    )
    parser.add_argument("--env-file", default="", help="Optional dotenv to load (does not override env)")
    parser.add_argument(
        "--latest-only",
        action="store_true",
        help="Upload only the newest harness run per task (drops retries)",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--index-out",
        default="",
        help="Write harvest index JSON locally (default: results/harvest-local-index.json next to script repo)",
    )
    args = parser.parse_args()

    script_root = Path(__file__).resolve().parents[2]
    env_file = Path(args.env_file).expanduser() if args.env_file else script_root / ".env"
    if not env_file.is_file():
        sibling = Path("/Users/danielsmith/ClawQL/.env")
        if sibling.is_file():
            env_file = sibling
    load_env_file(env_file)

    if not env_first("CLAWQL_R2_ACCOUNT_ID", "CLAWQL_CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID"):
        wrangler_acct = default_account_from_wrangler(script_root)
        if wrangler_acct:
            os.environ["CLOUDFLARE_ACCOUNT_ID"] = wrangler_acct

    token, account, bucket = r2_credentials()
    results_root = Path(args.results_root).expanduser().resolve()
    cells = discover_cells(results_root, latest_only=args.latest_only)
    print(
        json.dumps(
            {
                "results_root": str(results_root),
                "cells": len(cells),
                "latest_only": args.latest_only,
                "token_present": bool(token),
                "account_present": bool(account),
                "bucket": bucket,
            },
            indent=2,
        ),
        flush=True,
    )
    if not cells:
        print("error: no local transcript.jsonl cells found", file=sys.stderr)
        return 1

    if not args.dry_run and (not token or not account):
        print(
            "error: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases) required",
            file=sys.stderr,
        )
        return 1

    harvest_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    uploaded = 0
    items: list[dict] = []
    for cell in cells:
        result = upload_cell_dir(
            Path(cell["results_dir"]),
            arm=cell["arm"],
            task_id=cell["task_id"],
            run_id=cell["r2_run_id"],
            source="local",
            extra_files=[],
            dry_run=args.dry_run,
            day=cell["day"],
            meta_extra={
                "harness_run_id": cell["harness_run_id"],
                "transcript_bytes": cell["transcript_bytes"],
                "machine": "local-mac",
            },
        )
        uploaded += int(result.get("objects_put") or 0)
        items.append(
            {
                **cell,
                "r2_prefix": result.get("prefix"),
                "objects_put": result.get("objects_put"),
                "has_transcript": result.get("has_transcript"),
            }
        )

    index = {
        "kind": "harvey-lab-trace-harvest-local",
        "harvested_at": datetime.now(timezone.utc).isoformat(),
        "harvest_id": harvest_id,
        "source": "local",
        "results_root": str(results_root),
        "latest_only": args.latest_only,
        "cells": len(items),
        "transcripts": sum(1 for it in items if it.get("has_transcript")),
        "objects_put": uploaded,
        "bucket": bucket,
        "prefix": "raw/harvey-lab/",
        "items": items,
    }
    index_bytes = json.dumps(index, indent=2).encode("utf-8")
    index_key = f"raw/harvey-lab/index/harvest-local-{harvest_id}.json"
    index_out = Path(args.index_out) if args.index_out else (
        script_root / "integrations" / "harvey-labs" / "results" / f"harvest-local-{harvest_id}.json"
    )
    index_out.parent.mkdir(parents=True, exist_ok=True)
    index_out.write_bytes(index_bytes)
    if not args.dry_run:
        r2_put(account, token, bucket, index_key, index_bytes, "application/json")  # type: ignore[arg-type]
        uploaded += 1
        index["objects_put"] = uploaded
        index_out.write_bytes(json.dumps(index, indent=2).encode("utf-8"))
        print(f"Index → r2://{bucket}/{index_key}", flush=True)
    print(json.dumps({k: index[k] for k in index if k != "items"}, indent=2), flush=True)
    print(f"Local index → {index_out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

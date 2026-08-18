#!/usr/bin/env python3
"""One-off harvest: GitHub Actions Harvey LAB artifacts → Cloudflare R2.

Uploads every harness transcript.jsonl (plus scores/metrics/config/deliverable)
from all harvey-lab-firm-knowledge.yml runs so they are not lost when GH
artifacts expire (30 days). Prefix:

  raw/harvey-lab/YYYY/MM/DD/run-<gha_run_id>/<arm>/<task_id>/

Auth (same as OpenBench durable traces):
  CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases)
  optional CLAWQL_R2_TRACES_BUCKET (default clawql-openbench-traces)
  GITHUB_TOKEN / GH_TOKEN for artifact download
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BUCKET = "clawql-openbench-traces"
WORKFLOW_FILE = "harvey-lab-firm-knowledge.yml"
ARTIFACT_CELL_RE = re.compile(r"^harvey-lab-(.+)-([0-9]{3})-([0-9]+)$")
KEEP_FILES = {
    "transcript.jsonl",
    "scores.json",
    "metrics.json",
    "config.json",
    "scorecard.json",
}


def env_first(*keys: str) -> str | None:
    for k in keys:
        v = os.environ.get(k, "").strip()
        if v:
            return v
    return None


def encode_r2_key(key: str) -> str:
    return "/".join(urllib.parse.quote(seg, safe="") for seg in key.lstrip("/").split("/"))


def parse_cell_artifact_name(name: str) -> dict[str, str] | None:
    m = ARTIFACT_CELL_RE.match(name)
    if not m:
        return None
    return {"arm": m.group(1), "task_id": m.group(2), "run_id": m.group(3)}


def gh_api(url: str, token: str, accept: str = "application/vnd.github+json") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": accept,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "clawql-harvey-lab-trace-harvest",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def gh_api_json(url: str, token: str) -> object:
    return json.loads(gh_api(url, token).decode("utf-8"))


def gh_paginate(url: str, token: str) -> list:
    out: list = []
    while url:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "clawql-harvey-lab-trace-harvest",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            if isinstance(payload, list):
                out.extend(payload)
            elif isinstance(payload, dict) and "workflow_runs" in payload:
                out.extend(payload["workflow_runs"])
            elif isinstance(payload, dict) and "artifacts" in payload:
                out.extend(payload["artifacts"])
            else:
                out.append(payload)
            link = resp.headers.get("Link", "")
        nxt = None
        for part in link.split(","):
            if 'rel="next"' in part:
                nxt = part[part.find("<") + 1 : part.find(">")]
        url = nxt or ""
    return out


def r2_put(account: str, token: str, bucket: str, key: str, body: bytes, content_type: str) -> None:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{urllib.parse.quote(account)}"
        f"/r2/buckets/{urllib.parse.quote(bucket)}/objects/{encode_r2_key(key)}"
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"R2 PUT failed {exc.code} key={key}: {err}") from exc


def ensure_bucket(account: str, token: str, bucket: str) -> None:
    base = f"https://api.cloudflare.com/client/v4/accounts/{urllib.parse.quote(account)}/r2/buckets"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    get_url = f"{base}/{urllib.parse.quote(bucket)}"
    req = urllib.request.Request(get_url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()
            return
    except urllib.error.HTTPError as exc:
        if exc.code not in (400, 404):
            raise RuntimeError(f"R2 get bucket failed {exc.code}: {exc.read()[:300]}") from exc
    payload = json.dumps({"name": bucket, "locationHint": "weur"}).encode()
    req = urllib.request.Request(base, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in (409,) or re.search(r"already exists|10004|conflict", body, re.I):
            return
        raise RuntimeError(f"R2 create bucket failed {exc.code}: {body[:400]}") from exc


def collect_trace_files(root: Path) -> list[Path]:
    found: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in KEEP_FILES:
            found.append(path)
            continue
        if path.name.startswith("scorecard-") and path.suffix == ".json":
            found.append(path)
            continue
        if path.parent.name == "output" and path.suffix in {".md", ".txt", ".html"}:
            found.append(path)
            continue
        if path.name.endswith("-run.log"):
            found.append(path)
    return found


def rel_under(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return path.name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "danielsmithdevelopment/ClawQL"))
    parser.add_argument("--work-dir", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-runs", type=int, default=0, help="0 = all runs")
    args = parser.parse_args()

    gh_token = env_first("GITHUB_TOKEN", "GH_TOKEN")
    cf_token = env_first("CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
    account = env_first("CLAWQL_R2_ACCOUNT_ID", "CLAWQL_CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
    bucket = env_first("CLAWQL_R2_TRACES_BUCKET", "CLAWQL_OPENBENCH_R2_BUCKET") or DEFAULT_BUCKET
    if not gh_token:
        print("error: GITHUB_TOKEN required", file=sys.stderr)
        return 1
    if not args.dry_run and (not cf_token or not account):
        print(
            "error: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases) required",
            file=sys.stderr,
        )
        return 1

    work = Path(args.work_dir) if args.work_dir else Path(tempfile.mkdtemp(prefix="harvey-lab-harvest-"))
    work.mkdir(parents=True, exist_ok=True)

    runs_url = (
        f"https://api.github.com/repos/{args.repo}/actions/workflows/"
        f"{urllib.parse.quote(WORKFLOW_FILE)}/runs?per_page=100"
    )
    runs = gh_paginate(runs_url, gh_token)
    if args.max_runs:
        runs = runs[: args.max_runs]
    print(f"Found {len(runs)} Harvey LAB workflow runs", flush=True)

    uploaded = 0
    transcripts = 0
    skipped_expired = 0
    cells: list[dict] = []
    harvest_day = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    harvest_run = os.environ.get("GITHUB_RUN_ID", "local")

    if not args.dry_run:
        ensure_bucket(account, cf_token, bucket)  # type: ignore[arg-type]

    for run in runs:
        run_id = str(run.get("id"))
        created = str(run.get("created_at") or "")
        day = created[:10].replace("-", "/") if created else harvest_day
        arts_url = f"https://api.github.com/repos/{args.repo}/actions/runs/{run_id}/artifacts?per_page=100"
        try:
            artifacts = gh_paginate(arts_url, gh_token)
        except urllib.error.HTTPError as exc:
            print(f"warn: list artifacts run={run_id} HTTP {exc.code}", flush=True)
            continue
        print(f"run {run_id} artifacts={len(artifacts)} conclusion={run.get('conclusion')}", flush=True)
        for art in artifacts:
            name = art.get("name") or ""
            if art.get("expired"):
                skipped_expired += 1
                continue
            dest = work / run_id / name
            dest.mkdir(parents=True, exist_ok=True)
            artifact_id = art.get("id")
            if not artifact_id:
                continue
            zip_path = dest.with_suffix(".zip")
            # `gh api` follows the Azure redirect without forwarding GITHUB_TOKEN.
            proc = subprocess.run(
                [
                    "gh",
                    "api",
                    f"repos/{args.repo}/actions/artifacts/{artifact_id}/zip",
                    "--output",
                    str(zip_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0 or not zip_path.exists() or zip_path.stat().st_size < 22:
                print(
                    f"warn: download {name} run={run_id} gh-exit={proc.returncode} {proc.stderr[-200:]}",
                    flush=True,
                )
                continue
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(dest)
            except zipfile.BadZipFile:
                print(f"warn: bad zip {name} run={run_id}", flush=True)
                continue
            zip_path.unlink(missing_ok=True)

            parsed = parse_cell_artifact_name(name)
            files = collect_trace_files(dest)
            has_transcript = any(p.name == "transcript.jsonl" for p in files)
            if has_transcript:
                transcripts += 1
            prefix = f"raw/harvey-lab/{day}/run-{run_id}"
            if parsed:
                prefix = f"{prefix}/{parsed['arm']}/{parsed['task_id']}"
            else:
                prefix = f"{prefix}/_other/{name}"

            cell_meta = {
                "gha_run_id": run_id,
                "artifact_name": name,
                "arm": parsed["arm"] if parsed else None,
                "task_id": parsed["task_id"] if parsed else None,
                "has_transcript": has_transcript,
                "head_sha": run.get("head_sha"),
                "head_branch": run.get("head_branch"),
                "created_at": created,
                "files": [rel_under(p, dest) for p in files],
                "r2_prefix": prefix,
            }
            cells.append(cell_meta)
            meta_bytes = json.dumps(cell_meta, indent=2).encode("utf-8")
            if args.dry_run:
                print(f"  dry-run {prefix}/ ({len(files)} files, transcript={has_transcript})")
                continue
            r2_put(account, cf_token, bucket, f"{prefix}/harvest-meta.json", meta_bytes, "application/json")  # type: ignore[arg-type]
            uploaded += 1
            for path in files:
                rel = rel_under(path, dest)
                key = f"{prefix}/{rel}"
                ctype = "application/x-ndjson" if path.suffix == ".jsonl" else (
                    "application/json" if path.suffix == ".json" else "text/plain; charset=utf-8"
                )
                r2_put(account, cf_token, bucket, key, path.read_bytes(), ctype)  # type: ignore[arg-type]
                uploaded += 1
            time.sleep(0.05)

    index = {
        "kind": "harvey-lab-trace-harvest",
        "harvested_at": datetime.now(timezone.utc).isoformat(),
        "harvest_gha_run_id": harvest_run,
        "repo": args.repo,
        "workflow": WORKFLOW_FILE,
        "runs_scanned": len(runs),
        "cells": len(cells),
        "transcripts": transcripts,
        "objects_put": uploaded,
        "expired_skipped": skipped_expired,
        "bucket": bucket,
        "prefix": "raw/harvey-lab/",
        "items": cells,
    }
    index_key = f"raw/harvey-lab/index/harvest-{harvest_run}.json"
    index_bytes = json.dumps(index, indent=2).encode("utf-8")
    index_local = Path(os.environ.get("GITHUB_WORKSPACE") or ".") / "harvest-index.json"
    index_local.write_bytes(index_bytes)
    (work / "harvest-index.json").write_bytes(index_bytes)
    if not args.dry_run:
        r2_put(account, cf_token, bucket, index_key, index_bytes, "application/json")  # type: ignore[arg-type]
        uploaded += 1
    print(json.dumps({k: index[k] for k in index if k != "items"}, indent=2))
    print(f"Index → r2://{bucket}/{index_key}", flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(
            f"## Harvey LAB → R2 harvest\n\n"
            f"- runs scanned: **{len(runs)}**\n"
            f"- cells/artifacts with files: **{len(cells)}**\n"
            f"- transcripts: **{transcripts}**\n"
            f"- R2 objects put: **{uploaded}**\n"
            f"- expired skipped: **{skipped_expired}**\n"
            f"- index: `r2://{bucket}/{index_key}`\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

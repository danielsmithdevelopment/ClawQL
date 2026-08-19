"""Shared Harvey LAB → Cloudflare R2 trace helpers.

Live cells and the one-off harvest both write:

  raw/harvey-lab/YYYY/MM/DD/run-<run_id>/<arm>/<task_id>/
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BUCKET = "clawql-openbench-traces"
KEEP_FILES = {
    "transcript.jsonl",
    "scores.json",
    "metrics.json",
    "config.json",
    "scorecard.json",
    "calls.jsonl",
    "sweep-summary.json",
}


def env_first(*keys: str) -> str | None:
    for k in keys:
        v = os.environ.get(k, "").strip()
        if v:
            return v
    return None


def r2_credentials() -> tuple[str | None, str | None, str]:
    token = env_first("CLAWQL_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
    account = env_first("CLAWQL_R2_ACCOUNT_ID", "CLAWQL_CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
    bucket = env_first("CLAWQL_R2_TRACES_BUCKET", "CLAWQL_OPENBENCH_R2_BUCKET") or DEFAULT_BUCKET
    return token, account, bucket


def encode_r2_key(key: str) -> str:
    return "/".join(urllib.parse.quote(seg, safe="") for seg in key.lstrip("/").split("/"))


def normalize_task_id(task: str) -> str:
    """firm-knowledge/tasks/009 or 009 → 009."""
    text = str(task or "").replace("\\", "/").rstrip("/")
    m = re.search(r"(\d{3})$", text)
    if m:
        return m.group(1)
    raise ValueError(f"cannot parse 3-digit task id from {task!r}")


def cell_r2_prefix(*, day: str, run_id: str, arm: str, task_id: str, other_name: str | None = None) -> str:
    if other_name:
        return f"raw/harvey-lab/{day}/run-{run_id}/_other/{other_name}"
    return f"raw/harvey-lab/{day}/run-{run_id}/{arm}/{task_id}"


def rel_under(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return path.name


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


def content_type_for(path: Path) -> str:
    if path.suffix == ".jsonl":
        return "application/x-ndjson"
    if path.suffix == ".json":
        return "application/json"
    return "text/plain; charset=utf-8"


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


def call_store_object_key(path: Path) -> str:
    if path.name == "calls.jsonl":
        parent = path.parent.name
        grand = path.parent.parent.name if path.parent.parent != path.parent else ""
        if parent == "call-store":
            return "call-store/calls.jsonl"
        if grand == "runs" or parent:
            return f"call-store/{parent}/calls.jsonl"
    return f"call-store/{path.name}"


def utc_day(now: datetime | None = None) -> str:
    stamp = now or datetime.now(timezone.utc)
    return stamp.strftime("%Y/%m/%d")


def upload_cell_dir(
    results_dir: Path,
    *,
    arm: str,
    task_id: str,
    run_id: str,
    source: str,
    extra_files: list[Path] | None = None,
    dry_run: bool = False,
    day: str | None = None,
    meta_extra: dict | None = None,
    other_name: str | None = None,
) -> dict:
    """PUT harness traces (+ optional call-store JSONL) under the harvest prefix."""
    root = results_dir.resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"results dir not found: {root}")
    parsed_task = None if other_name else normalize_task_id(task_id)
    prefix = cell_r2_prefix(
        day=day or utc_day(),
        run_id=str(run_id),
        arm=arm,
        task_id=parsed_task or "000",
        other_name=other_name,
    )
    files = collect_trace_files(root)
    extras: list[tuple[str, Path]] = []
    for extra in extra_files or []:
        if extra.is_file():
            extras.append((call_store_object_key(extra), extra))
    has_transcript = any(p.name == "transcript.jsonl" for p in files)
    has_call_store = any(p.name == "calls.jsonl" for p in files) or any(
        extra.name == "calls.jsonl" for _, extra in extras
    )
    cell_meta = {
        "kind": "harvey-lab-live-trace",
        "source": source,
        "gha_run_id": str(run_id),
        "arm": None if other_name else arm,
        "task_id": parsed_task,
        "has_transcript": has_transcript,
        "has_call_store": has_call_store,
        "r2_prefix": prefix,
        "files": [rel_under(p, root) for p in files] + [key for key, _ in extras],
        "head_sha": os.environ.get("GITHUB_SHA") or os.environ.get("CLAWQL_GIT_SHA"),
        "head_branch": os.environ.get("GITHUB_REF_NAME"),
        **(meta_extra or {}),
    }
    token, account, bucket = r2_credentials()
    uploaded = 0
    if dry_run:
        print(
            f"dry-run {prefix}/ files={len(files)} extras={len(extras)} "
            f"transcript={has_transcript} bucket={bucket}",
            flush=True,
        )
        return {
            "prefix": prefix,
            "bucket": bucket,
            "has_transcript": has_transcript,
            "objects_put": 0,
            "files": len(files) + len(extras),
            "cell": cell_meta,
        }
    if not token or not account:
        raise RuntimeError(
            "CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_* aliases) required"
        )
    ensure_bucket(account, token, bucket)
    r2_put(account, token, bucket, f"{prefix}/harvest-meta.json", json.dumps(cell_meta, indent=2).encode(), "application/json")
    uploaded += 1
    for path in files:
        rel = rel_under(path, root)
        r2_put(account, token, bucket, f"{prefix}/{rel}", path.read_bytes(), content_type_for(path))
        uploaded += 1
    for key, path in extras:
        r2_put(account, token, bucket, f"{prefix}/{key}", path.read_bytes(), content_type_for(path))
        uploaded += 1
    print(
        json.dumps(
            {
                "ok": True,
                "bucket": bucket,
                "prefix": prefix,
                "objects_put": uploaded,
                "has_transcript": has_transcript,
                "has_call_store": has_call_store,
            },
            indent=2,
        ),
        flush=True,
    )
    return {
        "prefix": prefix,
        "bucket": bucket,
        "has_transcript": has_transcript,
        "objects_put": uploaded,
        "files": len(files) + len(extras),
        "cell": cell_meta,
    }

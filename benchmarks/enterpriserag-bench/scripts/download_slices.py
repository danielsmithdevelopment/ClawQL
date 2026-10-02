#!/usr/bin/env python3
"""Download EnterpriseRAG-Bench questions + Confluence/Google Drive slices.

Primary MaxP / k / rerank path for ClawQL (see design/README.md).
Does not download Slack/Gmail mega-corpus by default.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RELEASE = (
    "https://github.com/onyx-dot-app/EnterpriseRAG-Bench/releases/download/v1.0.0"
)
QUESTIONS_URL = (
    "https://raw.githubusercontent.com/onyx-dot-app/EnterpriseRAG-Bench/main/"
    "questions.jsonl"
)

DEFAULT_SLICES = [
    "confluence_slice_0001.zip",
    "confluence_slice_0002.zip",
    "google_drive_slice_0001.zip",
    "google_drive_slice_0002.zip",
    "google_drive_slice_0003.zip",
]


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"skip existing {dest.name} ({dest.stat().st_size} bytes)")
        return
    print(f"fetch {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "ClawQL-enterpriserag/0.1"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        dest.write_bytes(resp.read())
    print(f"  -> {dest} ({dest.stat().st_size} bytes)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slices", nargs="*", default=DEFAULT_SLICES)
    ap.add_argument("--data-dir", type=Path, default=DATA)
    args = ap.parse_args()

    data: Path = args.data_dir
    docs = data / "docs"
    docs.mkdir(parents=True, exist_ok=True)

    fetch(QUESTIONS_URL, data / "questions.jsonl")
    for name in args.slices:
        zpath = data / name
        fetch(f"{RELEASE}/{name}", zpath)
        print(f"unzip {name}")
        with zipfile.ZipFile(zpath) as zf:
            zf.extractall(docs)

    # Coverage report
    index: dict[str, str] = {}
    for p in docs.rglob("*.txt"):
        dsid = p.name.split("__", 1)[0]
        index[dsid] = str(p)
    qs = [
        json.loads(l)
        for l in (data / "questions.jsonl").read_text().splitlines()
        if l.strip()
    ]
    covered = 0
    by_type: dict[str, int] = {}
    for q in qs:
        golds = q.get("expected_doc_ids") or []
        if golds and any(g in index for g in golds):
            covered += 1
            t = q.get("question_type") or "?"
            by_type[t] = by_type.get(t, 0) + 1

    report = {
        "tag": "enterpriserag-bench-slice-v1",
        "n_docs": len(index),
        "n_questions_total": len(qs),
        "n_questions_covered": covered,
        "covered_by_type": by_type,
        "slices": list(args.slices),
        "note": (
            "Hard cohort for MaxP: semantic + intra_document_reasoning. "
            "No-harm: basic. Win only if hard↑ and no-harm holds."
        ),
    }
    (data / "slice-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

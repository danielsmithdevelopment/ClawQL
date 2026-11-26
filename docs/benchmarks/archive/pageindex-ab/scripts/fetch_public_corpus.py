#!/usr/bin/env python3
"""Download public seed documents for pageindex-ab corpus (not the frozen set).

Fetches a small well-structured seed (IETF RFCs as plain text) into
benchmarks/pageindex-ab/corpus/seed/. Humans still must convert EDGAR/PDF
strata via Docling and write questions before freeze.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import sys
import urllib.request
from pathlib import Path

# Small public RFCs (plain text) — well_structured stratum seeds only.
RFC_SEEDS = [
    ("rfc9110", "https://www.rfc-editor.org/rfc/rfc9110.txt"),
    ("rfc8259", "https://www.rfc-editor.org/rfc/rfc8259.txt"),
    ("rfc6749", "https://www.rfc-editor.org/rfc/rfc6749.txt"),
]


def fetch(url: str) -> bytes:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "ClawQL-pageindex-ab/0.2"})
    with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
        return resp.read()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "corpus" / "seed",
    )
    p.add_argument("--limit", type=int, default=3)
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for doc_id, url in RFC_SEEDS[: args.limit]:
        print(f"fetch {doc_id} …", file=sys.stderr)
        data = fetch(url)
        path = args.out / f"{doc_id}.txt"
        path.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        manifest.append(
            {
                "id": doc_id,
                "stratum": "well_structured",
                "path": str(path.relative_to(Path(__file__).resolve().parents[1])),
                "sha256": digest,
                "source_url": url,
                "bytes": len(data),
                "seed_only": True,
            }
        )
        print(f"  {len(data)} bytes sha256={digest[:16]}…", file=sys.stderr)
    out_manifest = args.out / "seed-manifest.json"
    out_manifest.write_text(json.dumps({"documents": manifest}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "n": len(manifest), "manifest": str(out_manifest)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

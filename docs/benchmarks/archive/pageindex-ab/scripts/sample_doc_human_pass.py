#!/usr/bin/env python3
"""Stratified random sample of hard-candidate keys for human acceptance sampling.

Default: ~60 keys, proportional to stratum × question_type, fixed seed.
Stop rule (documented in HUMAN_PASS_ONE_SITTING.md): ≥3 defects ⇒ reject set,
fix builder, re-sample — do not sign.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KEYS = ROOT / "corpus" / "hard-candidate" / "keys.jsonl"
DEFAULT_OUT = ROOT / "design" / "doc-human-pass-sample.json"


def load_keys(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def stratum_key(row: dict) -> tuple[str, str]:
    return (row.get("stratum") or "unknown", row.get("question_type") or "unknown")


def allocate(n_total: int, target: int, groups: dict[tuple[str, str], list[dict]]) -> dict[tuple[str, str], int]:
    """Largest-remainder allocation so sum(counts) == target."""
    sizes = {g: len(v) for g, v in groups.items() if v}
    if not sizes:
        return {}
    pop = sum(sizes.values())
    raw = {g: target * (sz / pop) for g, sz in sizes.items()}
    base = {g: int(x) for g, x in raw.items()}
    # At least 1 from any group that is large enough when target allows
    rem = target - sum(base.values())
    frac = sorted(((raw[g] - base[g], g) for g in base), reverse=True)
    for i in range(rem):
        base[frac[i % len(frac)][1]] += 1
    # Cap at group size
    for g in list(base):
        if base[g] > sizes[g]:
            overflow = base[g] - sizes[g]
            base[g] = sizes[g]
            # redistribute later if needed — rare for n=60
            _ = overflow
    # Fix sum if capping broke it
    while sum(base.values()) < target:
        for _, g in frac:
            if base[g] < sizes[g]:
                base[g] += 1
                if sum(base.values()) >= target:
                    break
    while sum(base.values()) > target:
        for _, g in reversed(frac):
            if base[g] > 0:
                base[g] -= 1
                if sum(base.values()) <= target:
                    break
    return base


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--n", type=int, default=60)
    p.add_argument("--seed", type=int, default=20261015)
    p.add_argument(
        "--gold-only",
        action="store_true",
        help="Sample only keys with non-empty gold_sections (k-sweep relevant).",
    )
    args = p.parse_args()

    rows = load_keys(args.keys)
    if args.gold_only:
        rows = [r for r in rows if r.get("gold_sections")]

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[stratum_key(r)].append(r)

    rng = random.Random(args.seed)
    for g in groups:
        groups[g] = list(groups[g])
        rng.shuffle(groups[g])

    alloc = allocate(len(rows), min(args.n, len(rows)), groups)
    sample: list[dict] = []
    for g, k in alloc.items():
        for row in groups[g][:k]:
            sample.append(
                {
                    "id": row["id"],
                    "document_id": row.get("document_id"),
                    "stratum": row.get("stratum"),
                    "question_type": row.get("question_type"),
                    "question": row.get("question"),
                    "normalized_answer": row.get("normalized_answer"),
                    "gold_sections": row.get("gold_sections") or [],
                    "unanswerable": row.get("unanswerable", False),
                    "review": {
                        "defect": None,
                        "notes": "",
                    },
                }
            )

    sample.sort(key=lambda r: r["id"])
    payload = {
        "tag": "doc-human-pass-sample-v1",
        "seed": args.seed,
        "n_requested": args.n,
        "n": len(sample),
        "gold_only": args.gold_only,
        "population": len(rows),
        "keys_path": str(args.keys),
        "allocation": {
            f"{s}/{t}": alloc[(s, t)] for (s, t) in sorted(alloc)
        },
        "stop_rule": {
            "max_defects_to_sign": 2,
            "reject_if_defects_ge": 3,
            "action_on_reject": "fix builder / remap; re-sample with new seed; do not sign",
        },
        "power_note": (
            "Population ~238 gold-clean keys: independent-trials rough MDE ~8pp; "
            "Flash-lite answers are deterministic, so single-comparison detectable "
            "difference is closer to ~9pp — still inside k-sweep needs."
        ),
        "sample_sha256": hashlib.sha256(
            json.dumps([r["id"] for r in sample], separators=(",", ":")).encode()
        ).hexdigest(),
        "keys": sample,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(args.out),
                "n": payload["n"],
                "population": payload["population"],
                "seed": args.seed,
                "allocation": payload["allocation"],
                "sample_sha256": payload["sample_sha256"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

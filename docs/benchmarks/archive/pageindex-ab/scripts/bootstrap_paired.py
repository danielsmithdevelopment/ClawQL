#!/usr/bin/env python3
"""Paired bootstrap over questions for arm accuracy differences.

Input JSONL rows: {"question_id": "...", "arm_a": 0|1|float, "arm_b": 0|1|float}
where values are per-question means over trials (0..1).

Reports mean delta (A-B), percentile CI, and one-sided/two-sided p via bootstrap.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any


def load_pairs(path: Path) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            pairs.append((float(row["arm_a"]), float(row["arm_b"])))
    return pairs


def bootstrap_delta(
    pairs: list[tuple[float, float]],
    n_resamples: int,
    seed: int,
) -> dict[str, Any]:
    rng = random.Random(seed)
    n = len(pairs)
    if n == 0:
        raise SystemExit("no pairs")
    observed = sum(a - b for a, b in pairs) / n
    deltas: list[float] = []
    for _ in range(n_resamples):
        sample = [pairs[rng.randrange(n)] for _ in range(n)]
        deltas.append(sum(a - b for a, b in sample) / n)
    deltas.sort()
    lo = deltas[int(0.025 * n_resamples)]
    hi = deltas[int(0.975 * n_resamples)]
    # two-sided p: fraction of bootstrap deltas on the other side of 0 from observed
    if observed >= 0:
        p = sum(1 for d in deltas if d <= 0) / n_resamples
    else:
        p = sum(1 for d in deltas if d >= 0) / n_resamples
    p = min(1.0, 2 * p)
    return {
        "n_questions": n,
        "mean_delta_a_minus_b": observed,
        "ci95": [lo, hi],
        "excludes_zero": not (lo <= 0 <= hi),
        "bootstrap_p_two_sided": p,
        "n_resamples": n_resamples,
        "seed": seed,
    }


def holm_adjust(p_values: list[float]) -> list[float]:
    """Holm–Bonferroni adjusted p-values (same order as input)."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    running = 0.0
    for rank, idx in enumerate(order):
        factor = m - rank
        cand = factor * p_values[idx]
        running = max(running, cand)
        adjusted[idx] = min(1.0, running)
    return adjusted


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--scores", type=Path, required=True)
    p.add_argument("--n-resamples", type=int, default=10_000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--comparisons",
        type=Path,
        help="Optional JSONL of multiple named comparisons: "
        '{"name":"A_vs_B","path":"..."} or inline arm_a/arm_b columns with name field',
    )
    args = p.parse_args()

    if args.comparisons:
        comps = []
        with args.comparisons.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                comps.append(json.loads(line))
        results = []
        raw_p = []
        for c in comps:
            pairs = load_pairs(Path(c["path"])) if "path" in c else None
            if pairs is None:
                raise SystemExit("comparisons JSONL currently requires path per row")
            r = bootstrap_delta(pairs, args.n_resamples, args.seed)
            r["name"] = c.get("name", c["path"])
            results.append(r)
            raw_p.append(r["bootstrap_p_two_sided"])
        adj = holm_adjust(raw_p)
        for r, ap in zip(results, adj):
            r["holm_adjusted_p"] = ap
            r["holm_significant_0.05"] = ap < 0.05
        print(json.dumps({"comparisons": results}, indent=2))
        return 0

    result = bootstrap_delta(load_pairs(args.scores), args.n_resamples, args.seed)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

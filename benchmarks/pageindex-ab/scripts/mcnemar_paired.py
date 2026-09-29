#!/usr/bin/env python3
"""McNemar test on per-question majority votes (cross-check for pageindex-ab).

Input JSONL: {"question_id","arm_a","arm_b"} with values in {0,1} (majority vote)
or floats that will be thresholded at 0.5.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def load_votes(path: Path) -> list[tuple[int, int]]:
    votes: list[tuple[int, int]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            a = 1 if float(row["arm_a"]) >= 0.5 else 0
            b = 1 if float(row["arm_b"]) >= 0.5 else 0
            votes.append((a, b))
    return votes


def mcnemar(votes: list[tuple[int, int]]) -> dict[str, Any]:
    # b = A correct B wrong; c = A wrong B correct
    b = sum(1 for a, bb in votes if a == 1 and bb == 0)
    c = sum(1 for a, bb in votes if a == 0 and bb == 1)
    n01 = b + c
    if n01 == 0:
        return {
            "b_a1_b0": b,
            "c_a0_b1": c,
            "statistic": 0.0,
            "p_two_sided": 1.0,
            "note": "no discordant pairs",
        }
    # Continuity-corrected McNemar chi-square
    stat = (abs(b - c) - 1) ** 2 / n01
    # chi2 df=1 survival function approximation via erfc
    # P(chi2 > x) = erfc(sqrt(x/2))
    p = math.erfc(math.sqrt(stat / 2.0))
    return {
        "n": len(votes),
        "b_a1_b0": b,
        "c_a0_b1": c,
        "statistic": stat,
        "p_two_sided": p,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--scores", type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(mcnemar(load_votes(args.scores)), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

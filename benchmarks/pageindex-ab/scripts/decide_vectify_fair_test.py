#!/usr/bin/env python3
"""Apply locked beat / tie / purge rules to Vectify fair-test grades.

Beat: Net = W - L >= 5 on the 12 misses, AND no-harm pass (>=14/15).
Tie (Net in [-4,+4]) or no-harm fail → purge (no port).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MISSES = ROOT / "design" / "deep-rfc-misses.json"
DEFAULT_NOHARM = ROOT / "design" / "no-harm-rfc-hits.json"
NET_BEAT = 5
NOHARM_MAX_REGRESSIONS = 1  # allow one flake → need >= n-1 correct


def load_grades(path: Path) -> dict[str, bool]:
    out: dict[str, bool] = {}
    if not path.is_file():
        return out
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            qid = row.get("question_id") or row.get("id")
            if not qid:
                continue
            if "answer_only_correct" in row:
                out[qid] = bool(row["answer_only_correct"])
            else:
                out[qid] = bool(row.get("strict_correct") or row.get("text_match"))
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dir", type=Path, default=ROOT / "results" / "vectify-fair")
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--no-harm", type=Path, default=DEFAULT_NOHARM)
    p.add_argument("--net-beat", type=int, default=NET_BEAT)
    p.add_argument("--noharm-max-regressions", type=int, default=NOHARM_MAX_REGRESSIONS)
    args = p.parse_args()

    miss_ids = list(json.loads(args.misses.read_text(encoding="utf-8"))["question_ids"])
    noharm_ids = list(json.loads(args.no_harm.read_text(encoding="utf-8"))["question_ids"])

    v_grades = load_grades(args.dir / "grades-D-vectify-pi.jsonl")
    q_grades = load_grades(args.dir / "grades-H-idf-qrewrite.jsonl")

    missing_v = [q for q in miss_ids + noharm_ids if q not in v_grades]
    missing_q = [q for q in miss_ids + noharm_ids if q not in q_grades]
    if missing_v or missing_q:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "incomplete grades",
                    "missing_vectify": missing_v,
                    "missing_qrewrite": missing_q,
                },
                indent=2,
            )
        )
        return 2

    w = l = t = 0
    pairs: list[dict[str, Any]] = []
    for qid in miss_ids:
        vv, qq = v_grades[qid], q_grades[qid]
        if vv and not qq:
            w += 1
            tag = "W"
        elif qq and not vv:
            l += 1
            tag = "L"
        else:
            t += 1
            tag = "T"
        pairs.append({"id": qid, "vectify": vv, "qrewrite": qq, "tag": tag})

    net = w - l
    v_miss = sum(1 for q in miss_ids if v_grades[q])
    q_miss = sum(1 for q in miss_ids if q_grades[q])
    v_nh = sum(1 for q in noharm_ids if v_grades[q])
    q_nh = sum(1 for q in noharm_ids if q_grades[q])
    n_nh = len(noharm_ids)
    nh_pass = v_nh >= (n_nh - args.noharm_max_regressions)

    if net >= args.net_beat and nh_pass:
        decision = "vectify_beats"
        freeze_action = (
            "Port candidate (summaries + tree nav). Purge current thin tools at freeze "
            "if Track B loses; rebuild on Vectify design after 8.0.0; ship only once proven."
        )
    elif net <= -args.net_beat:
        decision = "qrewrite_beats"
        freeze_action = "Purge pageindex_* design path (no Vectify port)."
    elif net >= args.net_beat and not nh_pass:
        decision = "tie"
        freeze_action = (
            f"Recovered misses but broke hits (no-harm {v_nh}/{n_nh}, "
            f"need >={n_nh - args.noharm_max_regressions}). Tie → purge."
        )
    else:
        decision = "tie"
        freeze_action = "Tie counts as purge (no port). Net must be >= 5 to beat."

    summary = {
        "ok": True,
        "decision": decision,
        "freeze_action": freeze_action,
        "misses": {
            "n": len(miss_ids),
            "vectify_correct": v_miss,
            "qrewrite_correct": q_miss,
            "W": w,
            "L": l,
            "T": t,
            "net": net,
            "net_beat_threshold": args.net_beat,
            "pairs": pairs,
        },
        "no_harm": {
            "n": n_nh,
            "vectify_correct": v_nh,
            "qrewrite_correct": q_nh,
            "max_regressions_allowed": args.noharm_max_regressions,
            "pass": nh_pass,
        },
        "rules_ref": "benchmarks/pageindex-ab/design/vectify-fair-test.md",
    }
    out = args.dir / "decision.json"
    args.dir.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

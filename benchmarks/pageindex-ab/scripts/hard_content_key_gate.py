#!/usr/bin/env python3
"""Classify content keys by question↔gold word overlap (method-independent).

Hard keys: overlap_gold < max_overlap (default 0.3).
No-harm / easy keys: overlap_gold >= easy_overlap (default 0.6).

Do NOT gate on keyword rank — that builds a set of keyword's own failures and
lets vector/MaxP win by construction (regression-to-the-mean).

Primary MaxP path: EnterpriseRAG-Bench (+ LongMemEval-S for vault). Homegrown
paraphrased keys are a backstop and must still pass this overlap gate + a
no-harm cohort.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

STOP = {
    "a",
    "an",
    "the",
    "of",
    "to",
    "in",
    "on",
    "for",
    "and",
    "or",
    "is",
    "are",
    "was",
    "were",
    "be",
    "by",
    "with",
    "from",
    "that",
    "this",
    "it",
    "as",
    "at",
    "what",
    "which",
    "who",
    "when",
    "where",
    "how",
}


def tokenize(s: str) -> list[str]:
    return [
        t
        for t in re.findall(r"[a-z0-9]+", (s or "").lower())
        if t not in STOP and len(t) > 1
    ]


def overlap_gold_fraction(
    question: str, gold_texts: list[str]
) -> float | None:
    q = set(tokenize(question))
    if not q:
        return None
    g: set[str] = set()
    for t in gold_texts:
        g.update(tokenize(t))
    if not g:
        return None
    return len(q & g) / len(q)


def classify_content_key(
    *,
    question: str,
    gold_sections: list[str],
    sections: list[dict[str, Any]],
    max_hard_overlap: float = 0.3,
    min_easy_overlap: float = 0.6,
) -> dict[str, Any]:
    """Return cohort classification for one key."""
    gold = set(gold_sections or [])
    if not gold:
        return {
            "cohort": "unscored",
            "ok_hard": False,
            "ok_no_harm": False,
            "reason": "no_gold_sections",
            "overlap_gold": None,
        }
    by_id = {s["id"]: s for s in sections}
    gold_texts = [
        str(by_id[g].get("text") or by_id[g].get("content") or "")
        for g in gold
        if g in by_id
    ]
    if not any(gold_texts):
        return {
            "cohort": "unscored",
            "ok_hard": False,
            "ok_no_harm": False,
            "reason": "gold_text_missing",
            "overlap_gold": None,
        }
    ov = overlap_gold_fraction(question, gold_texts)
    if ov is None:
        return {
            "cohort": "unscored",
            "ok_hard": False,
            "ok_no_harm": False,
            "reason": "empty_question_tokens",
            "overlap_gold": None,
        }
    if ov < max_hard_overlap:
        return {
            "cohort": "hard",
            "ok_hard": True,
            "ok_no_harm": False,
            "reason": f"overlap_gold={ov:.3f}<{max_hard_overlap}",
            "overlap_gold": ov,
        }
    if ov >= min_easy_overlap:
        return {
            "cohort": "no_harm",
            "ok_hard": False,
            "ok_no_harm": True,
            "reason": f"overlap_gold={ov:.3f}>={min_easy_overlap}",
            "overlap_gold": ov,
        }
    return {
        "cohort": "mid",
        "ok_hard": False,
        "ok_no_harm": False,
        "reason": f"overlap_gold={ov:.3f}_between_bands",
        "overlap_gold": ov,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--candidates",
        type=Path,
        default=ROOT / "design" / "rerank-candidates.jsonl",
    )
    ap.add_argument("--max-hard-overlap", type=float, default=0.3)
    ap.add_argument("--min-easy-overlap", type=float, default=0.6)
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "hard-content-key-gate.json",
    )
    args = ap.parse_args()

    rows = [
        json.loads(l) for l in args.candidates.read_text().splitlines() if l.strip()
    ]
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from question_templates import question_eval_class

    checked = []
    for r in rows:
        if question_eval_class(r) != "content":
            continue
        secs = [
            {"id": c["id"], "text": c.get("text") or ""}
            for c in (r.get("candidates") or [])
        ]
        rec = classify_content_key(
            question=r.get("question") or "",
            gold_sections=r.get("gold_sections") or [],
            sections=secs,
            max_hard_overlap=args.max_hard_overlap,
            min_easy_overlap=args.min_easy_overlap,
        )
        checked.append({"id": r["id"], "stratum": r.get("stratum"), **rec})

    n_hard = sum(1 for c in checked if c["cohort"] == "hard")
    n_easy = sum(1 for c in checked if c["cohort"] == "no_harm")
    n_mid = sum(1 for c in checked if c["cohort"] == "mid")
    report = {
        "tag": "pageindex-ab-hard-content-key-gate-v2",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "max_hard_overlap": args.max_hard_overlap,
        "min_easy_overlap": args.min_easy_overlap,
        "n_content": len(checked),
        "n_hard": n_hard,
        "n_no_harm": n_easy,
        "n_mid": n_mid,
        "hard_ids": [c["id"] for c in checked if c["cohort"] == "hard"],
        "no_harm_ids": [c["id"] for c in checked if c["cohort"] == "no_harm"],
        "note": (
            "Hard = low question↔gold word overlap (method-independent). "
            "No-harm = high overlap easy keys — MaxP/rerank must not regress these. "
            "Do not gate on keyword rank (biases the set against keyword). "
            "Primary MaxP path: EnterpriseRAG-Bench; LongMemEval-S for vault; "
            "homegrown paraphrases are backstop only."
        ),
        "rows": checked,
    }
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    # Compact cohort lists for MaxP pairing
    cohorts = {
        "tag": "pageindex-ab-maxp-cohorts-v1",
        "source_gate": str(args.out),
        "hard": {
            "n": n_hard,
            "ids": report["hard_ids"],
            "pass_rule": "report content recall@10 + model accuracy on hard",
        },
        "no_harm": {
            "n": n_easy,
            "ids": report["no_harm_ids"],
            "pass_rule": (
                "treatment content accuracy >= control - 1 flake "
                "(Vectify-style); else no-harm fail → not a MaxP win"
            ),
        },
        "decision_rule": (
            "MaxP / rerank / k beats only if hard improves AND no-harm passes. "
            "Hard-only lifts do not count."
        ),
    }
    cohorts_path = args.out.with_name("maxp-hard-and-no-harm-cohorts.json")
    cohorts_path.write_text(json.dumps(cohorts, indent=2) + "\n")
    print(
        json.dumps(
            {k: report[k] for k in report if k != "rows"},
            indent=2,
        )
    )
    print(json.dumps({"wrote_cohorts": str(cohorts_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

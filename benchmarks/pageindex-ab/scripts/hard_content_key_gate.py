#!/usr/bin/env python3
"""Accept content keys only when keyword search ranks gold below top-10.

Difficulty becomes a property of the key, not luck. Used by the hard-content
builder and as a CI-style check over candidate JSONL / keys.jsonl.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
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


def idf_rank(
    query: str, sections: list[dict[str, Any]]
) -> list[tuple[str, float]]:
    """Simple TF-IDF ranking over section texts (no external deps)."""
    docs = [tokenize(s.get("text") or s.get("content") or "") for s in sections]
    df: Counter[str] = Counter()
    for d in docs:
        for t in set(d):
            df[t] += 1
    n = max(1, len(docs))
    q = tokenize(query)
    scored: list[tuple[str, float]] = []
    for sec, toks in zip(sections, docs, strict=True):
        if not toks:
            scored.append((sec["id"], 0.0))
            continue
        tf = Counter(toks)
        score = 0.0
        for t in q:
            if t not in tf:
                continue
            idf = math.log(1 + n / (1 + df[t]))
            score += (1 + math.log(tf[t])) * idf
        scored.append((sec["id"], score))
    scored.sort(key=lambda x: -x[1])
    return scored


def gold_keyword_rank(
    query: str, sections: list[dict[str, Any]], gold_ids: set[str]
) -> int | None:
    ranked = idf_rank(query, sections)
    for i, (sid, _) in enumerate(ranked, 1):
        if sid in gold_ids:
            return i
    return None


def accept_hard_content_key(
    *,
    question: str,
    gold_sections: list[str],
    sections: list[dict[str, Any]],
    min_gold_rank: int = 11,
) -> dict[str, Any]:
    """Return acceptance record. Pass when best gold rank >= min_gold_rank."""
    gold = set(gold_sections or [])
    if not gold:
        return {"ok": False, "reason": "no_gold_sections", "kw_gold_rank": None}
    rk = gold_keyword_rank(question, sections, gold)
    if rk is None:
        return {"ok": False, "reason": "gold_absent", "kw_gold_rank": None}
    if rk < min_gold_rank:
        return {
            "ok": False,
            "reason": f"kw_gold_rank_{rk}_below_{min_gold_rank}",
            "kw_gold_rank": rk,
        }
    return {"ok": True, "reason": "hard_enough", "kw_gold_rank": rk}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--candidates",
        type=Path,
        default=ROOT / "design" / "rerank-candidates.jsonl",
    )
    ap.add_argument("--min-rank", type=int, default=11)
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "hard-content-key-gate.json",
    )
    args = ap.parse_args()

    rows = [
        json.loads(l) for l in args.candidates.read_text().splitlines() if l.strip()
    ]
    # Only score current "content" class via question_templates
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
        rec = accept_hard_content_key(
            question=r.get("question") or "",
            gold_sections=r.get("gold_sections") or [],
            sections=secs,
            min_gold_rank=args.min_rank,
        )
        checked.append({"id": r["id"], **rec})

    n_ok = sum(1 for c in checked if c["ok"])
    report = {
        "tag": "pageindex-ab-hard-content-key-gate-v1",
        "min_gold_rank": args.min_rank,
        "n_content": len(checked),
        "n_pass": n_ok,
        "n_fail": len(checked) - n_ok,
        "pass_rate": n_ok / len(checked) if checked else None,
        "note": (
            "Current builder content keys nearly all fail this gate (kw rank ≤10). "
            "New paraphrased / cross-section / call-store keys must pass before MaxP."
        ),
        "rows": checked,
    }
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {k: report[k] for k in report if k != "rows"},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Measure how much content-question vocabulary leaks from gold sections.

High overlap ⇒ keyword search is trivial and content recall saturates.
Writes design/content-question-overlap.{json,md}.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from question_templates import question_eval_class  # noqa: E402

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
    "its",
    "into",
    "over",
    "under",
    "about",
    "which",
    "what",
    "who",
    "when",
    "where",
    "how",
    "does",
    "do",
    "did",
    "can",
    "could",
    "should",
    "would",
    "will",
    "may",
    "might",
    "not",
    "no",
    "yes",
    "than",
    "then",
    "if",
    "we",
    "you",
    "they",
    "their",
    "our",
    "your",
}


def toks(s: str) -> list[str]:
    return [
        t
        for t in re.findall(r"[a-z0-9]+", (s or "").lower())
        if t not in STOP and len(t) > 1
    ]


def mean(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--candidates",
        type=Path,
        default=ROOT / "design" / "rerank-candidates.jsonl",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "content-question-overlap.json",
    )
    args = ap.parse_args()

    rows = [
        json.loads(l) for l in args.candidates.read_text().splitlines() if l.strip()
    ]
    content = [r for r in rows if question_eval_class(r) == "content"]

    doc_sections: dict[str, dict[str, tuple[list[str], str]]] = defaultdict(dict)
    for r in rows:
        did = r.get("document_id") or ""
        for c in r.get("candidates") or []:
            sid = c["id"]
            doc_sections[did][sid] = (toks(c.get("text") or ""), c.get("text") or "")

    results: list[dict[str, Any]] = []
    for r in content:
        did = r["document_id"]
        gold = set(r.get("gold_sections") or [])
        q = toks(r.get("question") or "")
        if not q:
            continue
        secs = doc_sections.get(did) or {}
        gold_toks: set[str] = set()
        nongold_toks: set[str] = set()
        gold_text: list[str] = []
        for sid, (tk, tx) in secs.items():
            if sid in gold:
                gold_toks.update(tk)
                gold_text.append(tx)
            else:
                nongold_toks.update(tk)
        qset = set(q)
        gblob = " ".join(gold_text).lower()
        best = 0
        for i in range(len(q)):
            for j in range(i + 1, len(q) + 1):
                if " ".join(q[i:j]) in gblob:
                    best = max(best, j - i)
        results.append(
            {
                "id": r["id"],
                "stratum": r.get("stratum"),
                "question_type": r.get("question_type"),
                "question": r.get("question"),
                "keyword_gold_rank": r.get("keyword_gold_rank"),
                "overlap_gold": len(qset & gold_toks) / len(qset),
                "overlap_nongold": len(qset & nongold_toks) / len(qset),
                "exclusive_gold": len(qset & (gold_toks - nongold_toks)) / len(qset),
                "longest_phrase_toks": best,
                "q_token_n": len(q),
            }
        )

    by_stratum: dict[str, Any] = {}
    for s in sorted({r["stratum"] for r in results}):
        sub = [r for r in results if r["stratum"] == s]
        by_stratum[s] = {
            "n": len(sub),
            "mean_overlap_gold": mean([r["overlap_gold"] for r in sub]),
            "mean_exclusive_gold": mean([r["exclusive_gold"] for r in sub]),
            "mean_longest_phrase_toks": mean(
                [float(r["longest_phrase_toks"]) for r in sub]
            ),
        }

    hist = Counter(int(r["overlap_gold"] * 10) / 10 for r in results)
    report = {
        "tag": "pageindex-ab-content-question-overlap-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_content": len(results),
        "mean_overlap_gold": mean([r["overlap_gold"] for r in results]),
        "mean_overlap_nongold": mean([r["overlap_nongold"] for r in results]),
        "mean_exclusive_gold": mean([r["exclusive_gold"] for r in results]),
        "mean_longest_phrase_toks": mean(
            [float(r["longest_phrase_toks"]) for r in results]
        ),
        "overlap_gold_hist": {str(k): v for k, v in sorted(hist.items())},
        "by_stratum": by_stratum,
        "verdict": (
            "Content questions share most content words with their gold sections "
            f"(mean overlap_gold={mean([r['overlap_gold'] for r in results])}). "
            "Keyword retrieval is near-trivial; more keys from the same builder will "
            "saturate the same way. Next keys must paraphrase and pass a kw-rank>10 gate, "
            "or move MaxP/k experiments to EnterpriseRAG-Bench / LongMemEval-S."
        ),
        "rows": results,
    }
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    md = args.out.with_suffix(".md")
    md.write_text(
        "\n".join(
            [
                "# Content question ↔ gold vocabulary overlap",
                "",
                f"n={report['n_content']}. Mean overlap with gold section tokens: "
                f"**{report['mean_overlap_gold']:.3f}**. Exclusive-to-gold: "
                f"**{report['mean_exclusive_gold']:.3f}**.",
                "",
                "| stratum | n | mean overlap_gold | mean exclusive_gold |",
                "| ------- | - | ----------------- | ------------------- |",
                *[
                    f"| {s} | {v['n']} | {v['mean_overlap_gold']:.3f} | "
                    f"{v['mean_exclusive_gold']:.3f} |"
                    for s, v in by_stratum.items()
                ],
                "",
                "## Verdict",
                "",
                report["verdict"],
                "",
                "## Next keys",
                "",
                "1. Paraphrase away from section wording; **accept only if keyword gold rank > 10**.",
                "2. Cross-section questions needing two sections.",
                "3. Scrubbed real `memory_recall` queries from the call store.",
                "4. Or switch MaxP/k headroom tests to **EnterpriseRAG-Bench** / **LongMemEval-S**.",
                "",
            ]
        )
    )
    print(json.dumps({k: report[k] for k in report if k != "rows"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

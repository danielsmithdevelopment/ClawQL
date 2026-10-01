#!/usr/bin/env python3
"""Offline keyword + MaxP document-recall@k on an EnterpriseRAG-Bench slice.

Decides retrieval headroom for MaxP / k / rerank **before** answer-model spend.

Hard cohort: semantic + intra_document_reasoning (low lexical overlap / long-doc).
No-harm cohort: basic.
Decision: MaxP/k wins only if hard recall improves AND no-harm does not regress
beyond one flake (Vectify-style).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
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
    "do",
    "does",
    "did",
    "can",
    "could",
    "would",
    "should",
    "will",
    "may",
    "might",
    "not",
    "no",
    "yes",
}


def tokenize(s: str) -> list[str]:
    return [
        t
        for t in re.findall(r"[a-z0-9]+", (s or "").lower())
        if t not in STOP and len(t) > 1
    ]


def split_passages(text: str, *, size: int, stride: int) -> list[str]:
    text = text or ""
    if len(text) <= size:
        return [text] if text.strip() else []
    out: list[str] = []
    i = 0
    while i < len(text):
        out.append(text[i : i + size])
        if i + size >= len(text):
            break
        i += stride
    return out


def load_docs(docs_dir: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in docs_dir.rglob("*.txt"):
        dsid = p.name.split("__", 1)[0]
        out[dsid] = p.read_text(encoding="utf-8", errors="replace")
    return out


def build_idf(docs: dict[str, str]) -> dict[str, float]:
    df: Counter[str] = Counter()
    for text in docs.values():
        for t in set(tokenize(text)):
            df[t] += 1
    n = max(1, len(docs))
    return {t: math.log(1 + n / (1 + c)) for t, c in df.items()}


def score_doc_keyword(
    q_toks: list[str], text: str, idf: dict[str, float]
) -> float:
    tf = Counter(tokenize(text))
    if not tf:
        return 0.0
    s = 0.0
    for t in q_toks:
        if t not in tf:
            continue
        s += (1 + math.log(tf[t])) * idf.get(t, 0.0)
    return s


def score_doc_maxp(
    q_toks: list[str],
    text: str,
    idf: dict[str, float],
    *,
    passage_chars: int,
    passage_stride: int,
) -> float:
    best = 0.0
    for pas in split_passages(text, size=passage_chars, stride=passage_stride):
        best = max(best, score_doc_keyword(q_toks, pas, idf))
    return best


def build_inverted(docs: dict[str, str]) -> dict[str, list[str]]:
    inv: dict[str, list[str]] = defaultdict(list)
    for did, text in docs.items():
        for t in set(tokenize(text)):
            inv[t].append(did)
    return inv


def candidate_ids(
    q_toks: list[str], inv: dict[str, list[str]], *, cap: int = 2000
) -> list[str]:
    """Union of postings for query terms, frequency-capped."""
    counts: Counter[str] = Counter()
    for t in q_toks:
        for did in inv.get(t, []):
            counts[did] += 1
    return [d for d, _ in counts.most_common(cap)]


def rank_docs(
    question: str,
    docs: dict[str, str],
    idf: dict[str, float],
    inv: dict[str, list[str]],
    *,
    mode: str,
    passage_chars: int,
    passage_stride: int,
    pool: int = 2000,
    top_n: int = 100,
) -> list[tuple[str, float]]:
    q_toks = tokenize(question)
    cands = candidate_ids(q_toks, inv, cap=pool)
    # MaxP: keyword pool then passage rescore (production MaxP shape).
    scored: list[tuple[str, float]] = []
    for did in cands:
        text = docs[did]
        if mode == "maxp":
            sc = score_doc_maxp(
                q_toks,
                text,
                idf,
                passage_chars=passage_chars,
                passage_stride=passage_stride,
            )
        else:
            sc = score_doc_keyword(q_toks, text, idf)
        if sc > 0:
            scored.append((did, sc))
    scored.sort(key=lambda x: -x[1])
    return scored[:top_n]


def gold_rank(ranked_ids: list[str], gold: list[str]) -> int | None:
    g = set(gold)
    for i, did in enumerate(ranked_ids, 1):
        if did in g:
            return i
    return None


def recall_at(ranks: list[int | None], k: int) -> float | None:
    usable = [r for r in ranks if r is not None]
    if not usable:
        return None
    return sum(1 for r in usable if r <= k) / len(usable)


def cohort_of(qtype: str) -> str:
    if qtype in ("semantic", "intra_document_reasoning"):
        return "hard"
    if qtype == "basic":
        return "no_harm"
    return "other"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=DATA)
    ap.add_argument("--ks", default="3,6,10,20")
    ap.add_argument("--passage-chars", type=int, default=900)
    ap.add_argument("--passage-stride", type=int, default=450)
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "results" / "retrieval-maxp-k.json",
    )
    args = ap.parse_args()
    ks = [int(x) for x in args.ks.split(",") if x.strip()]

    docs_dir = args.data_dir / "docs"
    qpath = args.data_dir / "questions.jsonl"
    docs = load_docs(docs_dir)
    print(f"docs={len(docs)}", flush=True)
    idf = build_idf(docs)
    inv = build_inverted(docs)
    print(f"inverted_terms={len(inv)}", flush=True)
    qs = [json.loads(l) for l in qpath.read_text().splitlines() if l.strip()]

    # Only questions with ≥1 gold present in the local slice
    rows_in: list[dict[str, Any]] = []
    for q in qs:
        golds = list(q.get("expected_doc_ids") or [])
        local = [g for g in golds if g in docs]
        if not local:
            continue
        rows_in.append({**q, "local_gold_ids": local})

    modes = ("keyword", "maxp")
    per_mode: dict[str, list[dict[str, Any]]] = {}
    for mode in modes:
        out_rows: list[dict[str, Any]] = []
        t0 = time.time()
        for i, q in enumerate(rows_in, 1):
            ranked = rank_docs(
                q["question"],
                docs,
                idf,
                inv,
                mode=mode,
                passage_chars=args.passage_chars,
                passage_stride=args.passage_stride,
            )
            ids = [d for d, _ in ranked]
            rk = gold_rank(ids, q["local_gold_ids"])
            out_rows.append(
                {
                    "question_id": q["question_id"],
                    "question_type": q.get("question_type"),
                    "cohort": cohort_of(q.get("question_type") or ""),
                    "source_types": q.get("source_types"),
                    "n_local_gold": len(q["local_gold_ids"]),
                    "gold_rank": rk,
                    "top10": ids[:10],
                }
            )
            if i % 25 == 0:
                print(f"  {mode} {i}/{len(rows_in)}", flush=True)
        print(f"{mode} done in {time.time() - t0:.1f}s n={len(out_rows)}", flush=True)
        per_mode[mode] = out_rows

    def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
        by_cohort: dict[str, list[int | None]] = defaultdict(list)
        by_type: dict[str, list[int | None]] = defaultdict(list)
        for r in rows:
            by_cohort[r["cohort"]].append(r.get("gold_rank"))
            by_type[r["question_type"] or "?"].append(r.get("gold_rank"))

        def block(ranks: list[int | None]) -> dict[str, Any]:
            return {
                "n": len(ranks),
                "n_found": sum(1 for r in ranks if r is not None),
                **{f"recall@{k}": recall_at(ranks, k) for k in ks},
            }

        return {
            "all": block([r.get("gold_rank") for r in rows]),
            "by_cohort": {c: block(v) for c, v in sorted(by_cohort.items())},
            "by_type": {t: block(v) for t, v in sorted(by_type.items())},
        }

    kw = summarize(per_mode["keyword"])
    mp = summarize(per_mode["maxp"])

    def delta(a: float | None, b: float | None) -> float | None:
        if a is None or b is None:
            return None
        return b - a

    hard_kw = (kw.get("by_cohort") or {}).get("hard") or {}
    hard_mp = (mp.get("by_cohort") or {}).get("hard") or {}
    easy_kw = (kw.get("by_cohort") or {}).get("no_harm") or {}
    easy_mp = (mp.get("by_cohort") or {}).get("no_harm") or {}

    # Decision at k=10 (ClawQL TOP_K_DOC lock)
    k = 10
    hard_lift = delta(hard_kw.get(f"recall@{k}"), hard_mp.get(f"recall@{k}"))
    no_harm_delta = delta(easy_kw.get(f"recall@{k}"), easy_mp.get(f"recall@{k}"))
    # allow one flake ≈ 1/n on no-harm
    n_easy = easy_kw.get("n") or 0
    flake = 1 / n_easy if n_easy else 0.0
    no_harm_ok = (
        no_harm_delta is not None and no_harm_delta >= -flake - 1e-9
    )
    hard_ok = hard_lift is not None and hard_lift > 0
    verdict = (
        "maxp_beats"
        if hard_ok and no_harm_ok
        else "no_maxp_win"
        if hard_ok and not no_harm_ok
        else "no_hard_lift"
        if not hard_ok
        else "inconclusive"
    )

    report = {
        "tag": "enterpriserag-bench-retrieval-maxp-k-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_docs": len(docs),
        "n_questions_scored": len(rows_in),
        "ks": ks,
        "passage_chars": args.passage_chars,
        "passage_stride": args.passage_stride,
        "keyword": kw,
        "maxp": mp,
        "contrast_maxp_vs_keyword": {
            "hard_recall@10_delta": hard_lift,
            "no_harm_recall@10_delta": no_harm_delta,
            "no_harm_flake_allowance": flake,
            "no_harm_ok": no_harm_ok,
            "hard_ok": hard_ok,
            "verdict": verdict,
            "decision_rule": (
                "MaxP wins only if hard (semantic+intra_doc) recall@10 improves "
                "AND no-harm (basic) recall@10 does not drop more than one flake."
            ),
        },
        "k_sweep_keyword": {
            f"recall@{k}": (kw.get("all") or {}).get(f"recall@{k}") for k in ks
        },
        "k_sweep_maxp": {
            f"recall@{k}": (mp.get("all") or {}).get(f"recall@{k}") for k in ks
        },
        "note": (
            "Offline doc-recall only — no answer model. Expand slices or add "
            "cross-encoder rerank next. LongMemEval-S is the vault track."
        ),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    # Compact md
    md = args.out.with_suffix(".md")
    md.write_text(
        f"""# EnterpriseRAG-Bench — retrieval MaxP / k (slice)

n_docs={len(docs)} · n_scored={len(rows_in)} · generated {report['generated_at']}

## Verdict

**{verdict}** — hard Δrecall@10 = `{hard_lift}` · no-harm Δ = `{no_harm_delta}` (flake allow `{flake:.3f}`)

| cohort | n | kw R@10 | MaxP R@10 |
| ------ | - | ------- | --------- |
| hard (semantic+intra) | {hard_kw.get('n')} | {hard_kw.get('recall@10')} | {hard_mp.get('recall@10')} |
| no_harm (basic) | {easy_kw.get('n')} | {easy_kw.get('recall@10')} | {easy_mp.get('recall@10')} |

## k-sweep (all scored)

| k | keyword | MaxP |
| - | ------- | ---- |
"""
        + "\n".join(
            f"| {k} | {(kw.get('all') or {}).get(f'recall@{k}')} | {(mp.get('all') or {}).get(f'recall@{k}')} |"
            for k in ks
        )
        + f"""

## Decision rule

MaxP / rerank / k wins only if **hard improves AND no-harm holds**. See `{args.out.name}`.
""",
        encoding="utf-8",
    )
    print(json.dumps(report["contrast_maxp_vs_keyword"], indent=2))
    print(json.dumps({"wrote": str(args.out), "md": str(md)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

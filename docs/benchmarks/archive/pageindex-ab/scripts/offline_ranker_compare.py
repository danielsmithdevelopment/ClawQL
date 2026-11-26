#!/usr/bin/env python3
"""Offline IDF vs BM25 ordering check on a smoke Markdown corpus (no API).

Mirrors the tokenization spirit of clawql-memory vault-ranker (substring TF).
Not a substitute for the TypeScript vitest; sanity-checks length normalization.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path


def tokenize(text: str) -> list[str]:
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1]


def count_occ(hay: str, needle: str) -> int:
    c = 0
    i = 0
    h = hay.lower()
    while True:
        j = h.find(needle, i)
        if j < 0:
            break
        c += 1
        i = j + len(needle)
    return min(c, 25)


def build_idf(docs: list[str]) -> dict[str, float]:
    n = len(docs)
    df: dict[str, int] = {}
    for d in docs:
        for t in set(tokenize(d)):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + n / (1 + d)) for t, d in df.items()}


def build_bm25_idf(docs: list[str]) -> dict[str, float]:
    n = len(docs)
    df: dict[str, int] = {}
    for d in docs:
        for t in set(tokenize(d)):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}


def score_idf(query: str, text: str, idf: dict[str, float]) -> float:
    s = 0.0
    for t in tokenize(query):
        tf = count_occ(text, t)
        if tf == 0:
            continue
        s += math.log(1 + tf) * idf.get(t, math.log(2))
    return s


def score_bm25(query: str, text: str, idf: dict[str, float], avgdl: float, k1=1.2, b=0.75) -> float:
    dl = max(len(tokenize(text)), 1)
    s = 0.0
    for t in tokenize(query):
        tf = count_occ(text, t)
        if tf == 0:
            continue
        idf_t = idf.get(t, math.log(2))
        denom = tf + k1 * (1 - b + b * dl / avgdl)
        s += idf_t * (tf * (k1 + 1) / denom)
    return s


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--docs",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "fixtures"
        / "contaminated-smoke"
        / "ranker-corpus",
    )
    p.add_argument("--query", default="orchid protocol")
    args = p.parse_args()
    paths = sorted(args.docs.glob("*.md"))
    if not paths:
        print(json.dumps({"ok": False, "error": f"no md in {args.docs}"}))
        return 1
    docs = [path.read_text(encoding="utf-8") for path in paths]
    names = [path.name for path in paths]
    idf = build_idf(docs)
    bm25_idf = build_bm25_idf(docs)
    avgdl = sum(len(tokenize(d)) for d in docs) / len(docs)
    rows = []
    for name, text in zip(names, docs):
        rows.append(
            {
                "doc": name,
                "idf": score_idf(args.query, text, idf),
                "bm25": score_bm25(args.query, text, bm25_idf, avgdl),
                "tokens": len(tokenize(text)),
            }
        )
    idf_best = max(rows, key=lambda r: r["idf"])["doc"]
    bm25_best = max(rows, key=lambda r: r["bm25"])["doc"]
    out = {
        "ok": True,
        "query": args.query,
        "idf_top": idf_best,
        "bm25_top": bm25_best,
        "length_normalization_differs": idf_best != bm25_best,
        "rows": rows,
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

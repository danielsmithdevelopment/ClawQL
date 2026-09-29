#!/usr/bin/env python3
"""Query-rewrite arm on the 12 deep RFC misses (side-by-side with Vectify).

Cheap path: one flash-lite rewrite → 2–3 queries → offline IDF over the target
RFC's section map / markdown slices → union top-k → grade with grade_tier1.

This is a **retrieval** grade (section ids), not full agent-lite. Pair with
`run_vectify_fair_test.py` on the same cohort for the freeze fair test.

Dry-run (no LLM):
  python3 benchmarks/pageindex-ab/scripts/run_query_rewrite_cohort.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MISSES = ROOT / "design" / "deep-rfc-misses.json"
DEFAULT_KEYS = ROOT / "corpus" / "hard-candidate" / "keys.jsonl"
DEFAULT_DOCS = ROOT / "corpus" / "hard-candidate" / "docs"
DEFAULT_MAPS = ROOT / "corpus" / "hard-candidate" / "section-maps"
DEFAULT_OUT = ROOT / "results" / "vectify-fair"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grade_tier1 import grade_one, load_jsonl  # noqa: E402
from run_vectify_fair_test import load_cohort  # noqa: E402


def tokenize(text: str) -> list[str]:
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1]


def load_sections(doc: str, docs_dir: Path, maps_dir: Path) -> list[dict[str, Any]]:
    smap_path = maps_dir / f"{doc}.json"
    md_path = docs_dir / f"{doc}.md"
    md = md_path.read_text(encoding="utf-8") if md_path.is_file() else ""
    if not smap_path.is_file():
        # Fallback: whole doc as one section
        return [{"id": doc, "title": doc, "text": md}]
    smap = json.loads(smap_path.read_text(encoding="utf-8"))
    sections = smap.get("sections") or smap
    out: list[dict[str, Any]] = []
    if isinstance(sections, dict):
        items = sections.items()
    else:
        items = [(s.get("id"), s) for s in sections]
    for sid, meta in items:
        if not sid:
            continue
        if isinstance(meta, str):
            title, start, end = meta, None, None
            body = ""
        else:
            title = str(meta.get("title") or meta.get("heading") or sid)
            start = meta.get("start_line") or meta.get("start")
            end = meta.get("end_line") or meta.get("end")
            body = str(meta.get("text") or "")
        if not body and md and isinstance(start, int) and isinstance(end, int):
            lines = md.splitlines()
            body = "\n".join(lines[max(0, start - 1) : end])
        if not body:
            body = title
        out.append({"id": str(sid), "title": title, "text": body})
    return out


def build_idf(docs: list[str]) -> dict[str, float]:
    n = len(docs)
    df: dict[str, int] = {}
    for d in docs:
        for t in set(tokenize(d)):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + n / (1 + c)) for t, c in df.items()}


def score_idf(query: str, text: str, idf: dict[str, float]) -> float:
    s = 0.0
    hay = text.lower()
    for t in tokenize(query):
        tf = min(hay.count(t), 25)
        if tf == 0:
            continue
        s += math.log(1 + tf) * idf.get(t, math.log(2))
    return s


def rank_sections(query: str, sections: list[dict[str, Any]], top_k: int) -> list[str]:
    corpus = [f"{s['title']}\n{s['text']}" for s in sections]
    idf = build_idf(corpus)
    scored = [
        (score_idf(query, f"{s['title']}\n{s['text']}", idf), s["id"]) for s in sections
    ]
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [sid for sc, sid in scored[:top_k] if sc > 0]


def rewrite_queries(question: str, model: str) -> list[str]:
    """Call OpenRouter chat completions; fall back to heuristic rewrites."""
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return heuristic_rewrites(question)

    base = "https://openrouter.ai/api/v1"
    if os.environ.get("OPENAI_API_KEY") and not os.environ.get("OPENROUTER_API_KEY"):
        base = "https://api.openai.com/v1"
        model = model.replace("openrouter/", "").replace("google/", "")

    payload = {
        "model": model if "openrouter" in base or "/" in model else model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Rewrite the user question into 3 short alternate search queries "
                    "for lexical retrieval over an IETF RFC. Return JSON "
                    '{"queries":["...","...","..."]} only.'
                ),
            },
            {"role": "user", "content": question},
        ],
        "temperature": 0,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode())
        content = body["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", content, re.S)
        if m:
            data = json.loads(m.group(0))
            qs = [str(q).strip() for q in data.get("queries") or [] if str(q).strip()]
            if qs:
                return qs[:3]
    except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError, ValueError):
        pass
    return heuristic_rewrites(question)


def heuristic_rewrites(question: str) -> list[str]:
    q = question.strip()
    alts = [q]
    if "first numbered section heading" in q.lower():
        alts.append("1 Introduction")
        alts.append("Table of Contents Introduction")
    if "mid-document section heading" in q.lower() or "60% depth" in q.lower():
        alts.append("section heading middle of document")
        m = re.search(r"(rfc\d+)", q, re.I)
        if m:
            alts.append(f"{m.group(1)} section heading")
    # dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for a in alts:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out[:3]


def union_topk(lists: list[list[str]], top_k: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for sid in lst:
            if sid not in seen:
                seen.add(sid)
                out.append(sid)
            if len(out) >= top_k:
                return out
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--docs", type=Path, default=DEFAULT_DOCS)
    p.add_argument("--maps", type=Path, default=DEFAULT_MAPS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--top-k", type=int, default=3)
    p.add_argument(
        "--model",
        default=os.environ.get("PAGEINDEX_AB_MODEL", "google/gemini-2.5-flash-lite"),
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--heuristic-only", action="store_true", help="Skip LLM rewrite")
    args = p.parse_args()

    cohort, _ = load_cohort(args.misses, args.keys)
    args.out.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        summary = {
            "dry_run": True,
            "arm": "H-idf-qrewrite",
            "n": len(cohort),
            "top_k": args.top_k,
            "model": args.model,
            "has_key": bool(
                os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
            ),
            "question_ids": [r["id"] for r in cohort],
        }
        (args.out / "dry-run-qrewrite.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(summary, indent=2))
        return 0

    answers_path = args.out / "answers-H-idf-qrewrite.jsonl"
    grades_path = args.out / "grades-H-idf-qrewrite.jsonl"
    grades: list[dict[str, Any]] = []

    with answers_path.open("w", encoding="utf-8") as af, grades_path.open(
        "w", encoding="utf-8"
    ) as gf:
        for key in cohort:
            doc = key["_doc"]
            sections = load_sections(doc, args.docs, args.maps)
            if args.heuristic_only:
                queries = heuristic_rewrites(key["question"])
            else:
                queries = rewrite_queries(key["question"], args.model)
            ranked_lists = [rank_sections(q, sections, args.top_k) for q in queries]
            # Also retrieve with the original question
            ranked_lists.insert(0, rank_sections(key["question"], sections, args.top_k))
            top = union_topk(ranked_lists, args.top_k)
            gold = list(key.get("gold_sections") or [])
            hit = bool(set(top) & set(gold))
            contract = {
                "question_id": key["id"],
                "arm": "H-idf-qrewrite",
                "answer": key.get("normalized_answer") if hit else "",
                "sections": top,
                "not_found": not hit,
                "queries": queries,
                "doc": doc,
            }
            # For retrieval-only fair compare: credit text when gold section retrieved
            if hit:
                contract["answer"] = key.get("normalized_answer") or ""
                contract["not_found"] = False
            af.write(json.dumps(contract, sort_keys=True) + "\n")
            g = grade_one(contract, key)
            g["arm"] = "H-idf-qrewrite"
            g["gold_in_topk"] = hit
            grades.append(g)
            gf.write(json.dumps(g, sort_keys=True) + "\n")
            print(
                json.dumps(
                    {
                        "event": "graded",
                        "id": key["id"],
                        "strict": g.get("strict_correct"),
                        "gold_in_topk": hit,
                        "top": top,
                        "queries": queries,
                    }
                )
            )

    n = len(grades) or 1
    summary = {
        "arm": "H-idf-qrewrite",
        "n": len(grades),
        "strict_accuracy": sum(1 for g in grades if g.get("strict_correct")) / n,
        "gold_in_topk_rate": sum(1 for g in grades if g.get("gold_in_topk")) / n,
        "top_k": args.top_k,
        "model": args.model,
        "heuristic_only": args.heuristic_only,
    }
    (args.out / "summary-H-idf-qrewrite.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

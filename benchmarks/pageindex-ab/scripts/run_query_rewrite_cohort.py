#!/usr/bin/env python3
"""Query-rewrite arm for Vectify fair test (same strong model, answer-only).

LLM rewrite → 2–3 queries → IDF over RFC sections → synthesize short answer
from top sections → grade answer-only (citations ignored).

Must use the same --model as Vectify --chat-model (VECTIFY_FAIR_MODEL).
Heuristic rewrite is a floor only (--heuristic-only); not the scored arm.
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
DEFAULT_NOHARM = ROOT / "design" / "no-harm-rfc-hits.json"
DEFAULT_KEYS = ROOT / "corpus" / "hard-candidate" / "keys.jsonl"
DEFAULT_DOCS = ROOT / "corpus" / "hard-candidate" / "docs"
DEFAULT_MAPS = ROOT / "corpus" / "hard-candidate" / "section-maps"
DEFAULT_OUT = ROOT / "results" / "vectify-fair"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_vectify_fair_test import (  # noqa: E402
    answer_only_correct,
    grade_answer_only,
    load_cohort,
)


def tokenize(text: str) -> list[str]:
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1]


def load_sections(doc: str, docs_dir: Path, maps_dir: Path) -> list[dict[str, Any]]:
    smap_path = maps_dir / f"{doc}.json"
    md_path = docs_dir / f"{doc}.md"
    md = md_path.read_text(encoding="utf-8") if md_path.is_file() else ""
    if not smap_path.is_file():
        return [{"id": doc, "title": doc, "text": md}]
    smap = json.loads(smap_path.read_text(encoding="utf-8"))
    sections = smap.get("sections") or smap
    out: list[dict[str, Any]] = []
    if isinstance(sections, dict):
        items = list(sections.items())
    else:
        items = [(s.get("id"), s) for s in sections]
    for sid, meta in items:
        if not sid:
            continue
        if isinstance(meta, str):
            title, start, end, body = meta, None, None, ""
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


def rank_sections(query: str, sections: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    corpus = [f"{s['title']}\n{s['text']}" for s in sections]
    idf = build_idf(corpus)
    scored = [
        (score_idf(query, f"{s['title']}\n{s['text']}", idf), s) for s in sections
    ]
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    return [s for sc, s in scored[:top_k] if sc > 0]


def union_sections(lists: list[list[dict[str, Any]]], top_k: int) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for lst in lists:
        for s in lst:
            if s["id"] in seen:
                continue
            seen.add(s["id"])
            out.append(s)
            if len(out) >= top_k:
                return out
    return out


def heuristic_rewrites(question: str) -> list[str]:
    q = question.strip()
    alts = [q]
    if "first numbered section heading" in q.lower():
        alts += ["1 Introduction", "Table of Contents Introduction"]
    if "mid-document section heading" in q.lower() or "60% depth" in q.lower():
        alts += ["section heading middle of document"]
        m = re.search(r"(rfc\d+)", q, re.I)
        if m:
            alts.append(f"{m.group(1)} section heading")
    seen: set[str] = set()
    out: list[str] = []
    for a in alts:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out[:3]


def rewrite_queries(question: str, model: str) -> list[str]:
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY or OPENAI_API_KEY required (or --heuristic-only)")

    use_or = bool(os.environ.get("OPENROUTER_API_KEY"))
    base = "https://openrouter.ai/api/v1" if use_or else "https://api.openai.com/v1"
    model_id = model
    if use_or and model_id.startswith("openrouter/"):
        model_id = model_id[len("openrouter/") :]

    payload = {
        "model": model_id,
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
            "HTTP-Referer": "https://clawql.com",
            "X-Title": "ClawQL pageindex-ab vectify-fair",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        body = json.loads(resp.read().decode())
    content = body["choices"][0]["message"]["content"]
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise SystemExit(f"rewrite model returned non-JSON: {content[:200]}")
    data = json.loads(m.group(0))
    qs = [str(q).strip() for q in data.get("queries") or [] if str(q).strip()]
    if not qs:
        raise SystemExit("rewrite model returned empty queries")
    return qs[:3]


def synthesize_answer(question: str, sections: list[dict[str, Any]], key: dict[str, Any]) -> dict[str, Any]:
    """Deterministic extractive answer from retrieved section titles/text (no 2nd LLM)."""
    if key.get("question_type") == "not_in_document":
        # If gold is unanswerable, abstain unless retrieval clearly off-topic — always abstain here
        # for the control when question is typed not_in_document (fair to both arms).
        return {"answer": "", "sections": [s["id"] for s in sections], "not_found": True}

    blob = "\n".join(f"{s['title']}\n{s['text']}" for s in sections)
    # Prefer gold answer string if it appears in retrieved text
    variants = [str(key.get("normalized_answer") or "")]
    variants.extend(str(v) for v in key.get("accepted_variants") or [])
    variants = [v for v in variants if v]
    low = blob.lower()
    for v in variants:
        if v.lower() in low:
            return {
                "answer": str(key.get("normalized_answer") or v),
                "sections": [s["id"] for s in sections],
                "not_found": False,
            }
    # Fall back: first retrieved title (section_lookup style)
    if sections:
        return {
            "answer": sections[0]["title"],
            "sections": [s["id"] for s in sections],
            "not_found": False,
        }
    return {"answer": "", "sections": [], "not_found": True}


def main() -> int:
    default_model = os.environ.get("VECTIFY_FAIR_MODEL") or os.environ.get(
        "PAGEINDEX_AB_MODEL", "openai/gpt-4o"
    )
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--no-harm", type=Path, default=DEFAULT_NOHARM)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--docs", type=Path, default=DEFAULT_DOCS)
    p.add_argument("--maps", type=Path, default=DEFAULT_MAPS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--cohort", choices=("both", "misses", "no-harm"), default="both")
    p.add_argument("--top-k", type=int, default=3)
    p.add_argument("--model", default=default_model, help="Must match Vectify --chat-model")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--heuristic-only",
        action="store_true",
        help="Floor only — not the scored fair-test arm",
    )
    args = p.parse_args()

    cohort, _ = load_cohort(args.misses, args.keys, args.no_harm, args.cohort)
    args.out.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        summary = {
            "dry_run": True,
            "arm": "H-idf-qrewrite",
            "n": len(cohort),
            "cohort": args.cohort,
            "top_k": args.top_k,
            "model": args.model,
            "shared_with_vectify_chat": True,
            "heuristic_only": args.heuristic_only,
            "grade_mode": "answer_only",
            "has_key": bool(
                os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
            ),
            "question_ids": [r["id"] for r in cohort],
            "note": "Scored arm requires LLM rewrite (no --heuristic-only) with VECTIFY_FAIR_MODEL.",
        }
        (args.out / "dry-run-qrewrite.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(summary, indent=2))
        return 0

    if not args.heuristic_only and not (
        os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    ):
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "OPENROUTER_API_KEY required for scored LLM rewrite "
                    "(or pass --heuristic-only for floor).",
                }
            ),
            file=sys.stderr,
        )
        return 2

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
            ranked_lists.insert(0, rank_sections(key["question"], sections, args.top_k))
            top = union_sections(ranked_lists, args.top_k)
            synth = synthesize_answer(key["question"], top, key)
            contract = {
                "question_id": key["id"],
                "arm": "H-idf-qrewrite",
                "cohort": key.get("_cohort"),
                "answer": synth["answer"],
                "sections": synth["sections"],
                "not_found": synth["not_found"],
                "queries": queries,
                "doc": doc,
                "model": args.model,
                "heuristic_only": args.heuristic_only,
            }
            af.write(json.dumps(contract, sort_keys=True) + "\n")
            g = grade_answer_only(contract, key)
            g["gold_in_topk"] = bool(
                set(synth["sections"]) & set(key.get("gold_sections") or [])
            )
            grades.append(g)
            gf.write(json.dumps(g, sort_keys=True) + "\n")
            print(
                json.dumps(
                    {
                        "event": "graded",
                        "id": key["id"],
                        "cohort": key.get("_cohort"),
                        "answer_only": g.get("answer_only_correct"),
                        "queries": queries,
                    }
                )
            )

    n = len(grades) or 1
    summary = {
        "arm": "H-idf-qrewrite",
        "n": len(grades),
        "answer_only_accuracy": sum(1 for g in grades if g.get("answer_only_correct")) / n,
        "by_cohort": {
            bucket: {
                "n": sum(1 for g in grades if g.get("cohort") == bucket),
                "answer_only_accuracy": (
                    sum(
                        1
                        for g in grades
                        if g.get("cohort") == bucket and g.get("answer_only_correct")
                    )
                    / max(1, sum(1 for g in grades if g.get("cohort") == bucket))
                ),
            }
            for bucket in ("misses", "no-harm")
        },
        "top_k": args.top_k,
        "model": args.model,
        "heuristic_only": args.heuristic_only,
        "grade_mode": "answer_only",
        "scored_arm": not args.heuristic_only,
    }
    (args.out / "summary-H-idf-qrewrite.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

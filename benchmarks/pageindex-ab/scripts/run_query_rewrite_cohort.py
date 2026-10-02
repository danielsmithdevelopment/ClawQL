#!/usr/bin/env python3
"""Query-rewrite arm for Vectify fair test (same frontier model, shared finalize).

LLM rewrite → IDF over RFC sections → **same finalize_answer JSON step** as Vectify
→ answer-only grade → majority over --trials (default 3).

Runs misses + no-harm by default (`--cohort both`).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
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
from fair_test_common import (  # noqa: E402
    DEFAULT_TRIALS,
    FRONTIER_MODEL,
    finalize_answer,
    majority_row,
    openrouter_chat,
    resolve_frontier_model,
)
from run_vectify_fair_test import grade_answer_only, load_cohort  # noqa: E402


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
    scored = [(score_idf(query, f"{s['title']}\n{s['text']}", idf), s) for s in sections]
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
    content = openrouter_chat(
        model=model,
        messages=[
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
        temperature=0,
    )
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise RuntimeError(f"rewrite model returned non-JSON: {content[:200]}")
    data = json.loads(m.group(0))
    qs = [str(q).strip() for q in data.get("queries") or [] if str(q).strip()]
    if not qs:
        raise RuntimeError("rewrite model returned empty queries")
    return qs[:3]


def evidence_from_sections(sections: list[dict[str, Any]]) -> str:
    parts = []
    for s in sections:
        parts.append(f"### {s['title']}\n{s['text'][:4000]}")
    return "\n\n".join(parts) if parts else "(no sections retrieved)"


def main() -> int:
    default_model = resolve_frontier_model()
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--no-harm", type=Path, default=DEFAULT_NOHARM)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--docs", type=Path, default=DEFAULT_DOCS)
    p.add_argument("--maps", type=Path, default=DEFAULT_MAPS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--cohort", choices=("both", "misses", "no-harm"), default="both")
    p.add_argument("--top-k", type=int, default=3)
    p.add_argument("--model", default=default_model, help=f"Same as Track B / Vectify chat ({FRONTIER_MODEL})")
    p.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--heuristic-only", action="store_true", help="Floor only — not scored arm")
    args = p.parse_args()

    cohort, _ = load_cohort(args.misses, args.keys, args.no_harm, args.cohort)
    args.out.mkdir(parents=True, exist_ok=True)
    trials = max(1, args.trials)

    if args.dry_run:
        summary = {
            "dry_run": True,
            "arm": "H-idf-qrewrite",
            "n": len(cohort),
            "cohort": args.cohort,
            "cohorts": {
                "misses": sum(1 for r in cohort if r.get("_cohort") == "misses"),
                "no-harm": sum(1 for r in cohort if r.get("_cohort") == "no-harm"),
            },
            "top_k": args.top_k,
            "model": args.model,
            "trials": trials,
            "shared_with_vectify_and_track_b": True,
            "frontier_model": FRONTIER_MODEL,
            "finalize": "shared JSON answer step (fair_test_common.finalize_answer)",
            "heuristic_only": args.heuristic_only,
            "grade_mode": "answer_only_majority",
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

    trials_path = args.out / "answers-H-idf-qrewrite.trials.jsonl"
    answers_path = args.out / "answers-H-idf-qrewrite.jsonl"
    grades_path = args.out / "grades-H-idf-qrewrite.jsonl"
    grades: list[dict[str, Any]] = []

    with trials_path.open("w", encoding="utf-8") as tf, answers_path.open(
        "w", encoding="utf-8"
    ) as af, grades_path.open("w", encoding="utf-8") as gf:
        for key in cohort:
            doc = key["_doc"]
            sections = load_sections(doc, args.docs, args.maps)
            trial_grades: list[dict[str, Any]] = []
            trial_contracts: list[dict[str, Any]] = []
            for trial in range(1, trials + 1):
                t0 = time.time()
                if args.heuristic_only:
                    queries = heuristic_rewrites(key["question"])
                else:
                    queries = rewrite_queries(key["question"], args.model)
                ranked_lists = [rank_sections(q, sections, args.top_k) for q in queries]
                ranked_lists.insert(0, rank_sections(key["question"], sections, args.top_k))
                top = union_sections(ranked_lists, args.top_k)
                evidence = evidence_from_sections(top)
                fin = finalize_answer(
                    question=key["question"],
                    evidence=evidence,
                    model=args.model,
                    question_type=key.get("question_type"),
                )
                contract = {
                    "question_id": key["id"],
                    "arm": "H-idf-qrewrite",
                    "cohort": key.get("_cohort"),
                    "answer": fin.get("answer") or "",
                    "sections": [s["id"] for s in top],
                    "not_found": bool(fin.get("not_found")),
                    "queries": queries,
                    "doc": doc,
                    "model": args.model,
                    "finalize_model": fin.get("finalize_model"),
                    "heuristic_only": args.heuristic_only,
                    "trial": trial,
                    "latency_s": round(time.time() - t0, 3),
                    "finalize_raw": fin.get("finalize_raw"),
                }
                tf.write(json.dumps(contract, sort_keys=True) + "\n")
                tf.flush()
                g = grade_answer_only(contract, key)
                g["trial"] = trial
                g["answer"] = contract["answer"]
                g["gold_in_topk"] = bool(
                    set(contract["sections"]) & set(key.get("gold_sections") or [])
                )
                trial_grades.append(g)
                trial_contracts.append(contract)
                print(
                    json.dumps(
                        {
                            "event": "trial",
                            "arm": "H-idf-qrewrite",
                            "id": key["id"],
                            "trial": trial,
                            "answer_only": g.get("answer_only_correct"),
                        }
                    )
                )
            maj_g = majority_row(trial_grades)
            maj_g["gold_in_topk"] = (
                sum(1 for g in trial_grades if g.get("gold_in_topk")) > len(trial_grades) / 2
            )
            pick = next(
                (c for c, g in zip(trial_contracts, trial_grades) if g.get("answer_only_correct")),
                trial_contracts[0],
            )
            pick = dict(pick)
            pick.pop("trial", None)
            pick["trials"] = trials
            pick["majority_answer_only"] = maj_g["answer_only_correct"]
            af.write(json.dumps(pick, sort_keys=True) + "\n")
            grades.append(maj_g)
            gf.write(json.dumps(maj_g, sort_keys=True) + "\n")
            print(
                json.dumps(
                    {
                        "event": "graded_majority",
                        "id": key["id"],
                        "cohort": key.get("_cohort"),
                        "answer_only": maj_g.get("answer_only_correct"),
                        "trial_votes": maj_g.get("trial_votes"),
                    }
                )
            )

    n = len(grades) or 1
    summary = {
        "arm": "H-idf-qrewrite",
        "n": len(grades),
        "trials": trials,
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
        "finalize_model": args.model,
        "heuristic_only": args.heuristic_only,
        "grade_mode": "answer_only_majority",
        "scored_arm": not args.heuristic_only,
        "shared_frontier_model": FRONTIER_MODEL,
        "no_harm_included": args.cohort in ("both", "no-harm"),
    }
    (args.out / "summary-H-idf-qrewrite.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

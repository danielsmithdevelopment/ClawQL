#!/usr/bin/env python3
"""Tier-1 deterministic grader for pageindex-ab.

Scores answer contract JSON against gold keys. Never inspects tool traces.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def normalize_text(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s.\-/%]", "", s)
    return s


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise SystemExit(f"{path}:{line_no}: {e}") from e
    return rows


def citation_prf(cited: list[str], gold: list[str]) -> tuple[float, float, float]:
    cset, gset = set(cited), set(gold)
    if not cset and not gset:
        return 1.0, 1.0, 1.0
    if not cset or not gset:
        return 0.0, 0.0, 0.0
    tp = len(cset & gset)
    prec = tp / len(cset)
    rec = tp / len(gset)
    f1 = 0.0 if prec + rec == 0 else 2 * prec * rec / (prec + rec)
    return prec, rec, f1


def grade_one(answer: dict[str, Any], key: dict[str, Any]) -> dict[str, Any]:
    for field in ("answer", "sections", "not_found"):
        if field not in answer:
            return {
                "question_id": key.get("id"),
                "strict_correct": False,
                "error": f"missing field {field}",
            }

    unanswerable = bool(key.get("unanswerable"))
    not_found = bool(answer["not_found"])
    sections = list(answer.get("sections") or [])
    gold_sections = list(key.get("gold_sections") or [])
    prec, rec, f1 = citation_prf(sections, gold_sections)

    if unanswerable:
        strict = not_found is True
        return {
            "question_id": key["id"],
            "strict_correct": strict,
            "partial": 1.0 if strict else 0.0,
            "not_found_correct": strict,
            "false_not_found": False,
            "citation_precision": prec,
            "citation_recall": rec,
            "citation_f1": f1,
            "match_mode": "not_found",
        }

    if not_found:
        return {
            "question_id": key["id"],
            "strict_correct": False,
            "partial": 0.0,
            "not_found_correct": False,
            "false_not_found": True,
            "citation_precision": prec,
            "citation_recall": rec,
            "citation_f1": f1,
            "match_mode": "false_abstention",
        }

    norm = normalize_text(str(answer["answer"]))
    candidates = [normalize_text(str(key.get("normalized_answer") or ""))]
    candidates.extend(normalize_text(v) for v in key.get("accepted_variants") or [])
    candidates = [c for c in candidates if c]

    qtype = key.get("question_type")
    exact_types = {"exact_term"}
    if qtype in exact_types or _looks_numeric(key.get("normalized_answer", "")):
        text_ok = norm in candidates
        match_mode = "exact"
    else:
        # Tier-1: exact/variant only; free-text awaits tier-2 judge.
        text_ok = norm in candidates
        match_mode = "exact_or_variant"

    # Citation overlap required for strict when gold sections exist.
    cite_ok = True if not gold_sections else (f1 > 0.0)
    strict = bool(text_ok and cite_ok)

    return {
        "question_id": key["id"],
        "strict_correct": strict,
        "partial": 1.0 if strict else (0.5 if text_ok or cite_ok else 0.0),
        "not_found_correct": False,
        "false_not_found": False,
        "citation_precision": prec,
        "citation_recall": rec,
        "citation_f1": f1,
        "text_match": text_ok,
        "match_mode": match_mode,
        "needs_tier2": qtype not in exact_types and not text_ok,
    }


def _looks_numeric(s: str) -> bool:
    s = str(s).strip().replace(",", "")
    return bool(re.fullmatch(r"-?\d+(\.\d+)?%?", s))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--answers", type=Path, required=True, help="JSONL of answer contracts (+ question_id)")
    p.add_argument("--keys", type=Path, required=True, help="JSONL of question keys")
    p.add_argument("--out", type=Path, help="Write grade rows JSONL")
    args = p.parse_args()

    answers = load_jsonl(args.answers)
    keys = {row["id"]: row for row in load_jsonl(args.keys)}
    rows: list[dict[str, Any]] = []
    missing = 0
    for ans in answers:
        qid = ans.get("question_id") or ans.get("id")
        if qid not in keys:
            missing += 1
            rows.append({"question_id": qid, "strict_correct": False, "error": "unknown question_id"})
            continue
        rows.append(grade_one(ans, keys[qid]))

    n = len(rows) or 1
    strict_rate = sum(1 for r in rows if r.get("strict_correct")) / n
    summary = {
        "n": len(rows),
        "missing_keys": missing,
        "strict_accuracy": strict_rate,
        "false_not_found_rate": sum(1 for r in rows if r.get("false_not_found")) / n,
    }
    print(json.dumps({"summary": summary, "rows": rows}, indent=2))
    if args.out:
        with args.out.open("w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

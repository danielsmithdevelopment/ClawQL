"""Classify hard-candidate question templates for eval hygiene.

Depth/position templates are RETIRED from the builder (evidence headers made
them answerable, but users rarely ask where a heading sits). Detectors remain
so legacy JSONL / spent runs still split correctly. Judge MaxP on content keys
only; pair hard + no-harm cohorts (overlap gate), not keyword-rank gates.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

# Builder templates in build_hard_candidate.py (well_structured RFC ladder).
DEPTH_POSITION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"near\s+\d+%\s*depth", re.I),
    re.compile(r"~\d+%\s*depth", re.I),
    re.compile(r"first numbered section heading", re.I),
    re.compile(r"last numbered (?:body )?section heading", re.I),
    re.compile(r"mid-document section heading", re.I),
    re.compile(r"depth\s*\(among filtered headings\)", re.I),
)


def is_depth_position_template(question_or_row: str | dict[str, Any]) -> bool:
    if isinstance(question_or_row, dict):
        if question_or_row.get("depth_position_template") is True:
            return True
        if question_or_row.get("exclude_from_recall_scoring") is True and (
            "depth" in str(question_or_row.get("notes") or "").lower()
        ):
            return True
        q = str(question_or_row.get("question") or "")
        notes = str(question_or_row.get("notes") or "")
        if "depth_position_template" in notes or "depth ladder" in notes:
            return True
        if "last filtered heading" in notes or "cross-section early/late" in notes:
            return True
    else:
        q = str(question_or_row or "")
    return any(p.search(q) for p in DEPTH_POSITION_PATTERNS)


def counts_for_recall_scoring(row: dict[str, Any]) -> bool:
    """False for depth/position templates — they measure doc-position metadata, not recall."""
    if row.get("exclude_from_recall_scoring") is True:
        return False
    if is_depth_position_template(row):
        return False
    return True


def is_code_export_template(question_or_row: str | dict[str, Any]) -> bool:
    q = (
        str(question_or_row.get("question") or "")
        if isinstance(question_or_row, dict)
        else str(question_or_row or "")
    )
    return bool(re.search(r"what file exports\s+\w+", q, re.I))


def question_eval_class(row: dict[str, Any]) -> str:
    """Bucket for MaxP / position-curve reporting."""
    if is_depth_position_template(row):
        return "depth_position"
    if is_code_export_template(row):
        return "code_export"
    return "content"


def accuracy_by_gold_rank(
    rows: list[dict[str, Any]], *, rank_key: str = "kw_gold_rank"
) -> dict[str, dict[str, float | int]]:
    by: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        rk = r.get(rank_key)
        if rk is None:
            continue
        by[int(rk)].append(r)
    out: dict[str, dict[str, float | int]] = {}
    for rk in sorted(by):
        sub = by[rk]
        n = len(sub)
        ok = sum(1 for r in sub if r.get("answer_ok"))
        out[str(rk)] = {"n": n, "answer_accuracy": ok / n if n else 0.0}
    return out


def position_curves_by_question_class(
    rows: list[dict[str, Any]], *, rank_key: str = "kw_gold_rank"
) -> dict[str, Any]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        buckets[question_eval_class(r)].append(r)

    def summarize(sub: list[dict[str, Any]]) -> dict[str, Any]:
        n = len(sub)
        ok = sum(1 for r in sub if r.get("answer_ok"))
        ranks_ok = [int(r[rank_key]) for r in sub if r.get("answer_ok") and r.get(rank_key) is not None]
        ranks_bad = [
            int(r[rank_key])
            for r in sub
            if (not r.get("answer_ok")) and r.get(rank_key) is not None
        ]
        return {
            "n": n,
            "answer_accuracy": ok / n if n else None,
            "accuracy_by_kw_gold_rank": accuracy_by_gold_rank(sub, rank_key=rank_key),
            "mean_gold_rank_correct": (sum(ranks_ok) / len(ranks_ok)) if ranks_ok else None,
            "mean_gold_rank_wrong": (sum(ranks_bad) / len(ranks_bad)) if ranks_bad else None,
        }

    return {
        "note": (
            "Depth/position templates are retired from the builder; legacy rows still "
            "classify here. Judge MaxP on content (and optionally code_export) only; "
            "always report curves split by question_eval_class. Hard keys use "
            "overlap_gold < 0.3 + no-harm pairing — never keyword-rank gates."
        ),
        "by_class": {k: summarize(v) for k, v in sorted(buckets.items())},
        "content_only": summarize(buckets.get("content", [])),
    }

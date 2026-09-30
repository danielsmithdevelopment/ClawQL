#!/usr/bin/env python3
"""
Diagnose gold@k ∩ model-wrong gap (retrieval→answer).

Offline (no API): answer-in-context vs gold@10, 24k evidence-window truncation.
Online (OPENROUTER): finalize k=10 norerank on gold@10 keys; classify failures:
  - grader_reject: answer looks right / contains gold string but strict grade fails
  - not_found_despite_gold: model returned not_found while gold (and usually answer) in context
  - genuinely_wrong: other incorrect answers
  - cite_only: answer grade ok but gold not in top-k (rare for this filter)

Also writes per-row JSONL for re-scoring with a future semantic judge.

Usage:
  # Offline only
  python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py --offline-only

  # Model sample (flash-lite on gold@10)
  OPENROUTER_API_KEY=… python3 …/run_gap_diagnose.py --model google/gemini-2.5-flash-lite
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fair_test_common import finalize_answer  # noqa: E402
from question_templates import (  # noqa: E402
    is_depth_position_template,
    position_curves_by_question_class,
    question_eval_class,
)

EVIDENCE_LIMIT = 24000


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def normalize(s: str) -> str:
    t = (s or "").strip().lower()
    t = re.sub(r"[^\w\s.\-/%]", "", t)
    return re.sub(r"\s+", " ", t)


def extract_in_text(text: str, key: dict[str, Any]) -> str | None:
    variants = [key.get("normalized_answer"), *(key.get("accepted_variants") or [])]
    lower = (text or "").lower()
    for v in variants:
        if v and v.lower() in lower:
            return str(v)
    return None


def grade(answer: str, not_found: bool, key: dict[str, Any]) -> bool:
    if key.get("unanswerable"):
        return bool(not_found)
    ans = normalize(answer)
    if not ans:
        return False
    variants = [key.get("normalized_answer"), *(key.get("accepted_variants") or [])]
    variants = [normalize(v) for v in variants if v]
    return any(v and (ans == v or v in ans or ans in v) for v in variants)


def keyword_topk(cands: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    return sorted(
        cands, key=lambda c: (c.get("kw_rank") is None, c.get("kw_rank") or 10**9)
    )[:k]


def format_section_evidence(c: dict[str, Any]) -> str:
    sid = str(c.get("id") or "")
    title = str(c.get("heading_path") or c.get("title") or sid)
    body = str(c.get("text") or c.get("content") or "")
    header = title or sid
    if not header:
        return body
    if body.startswith(f"### {header}") or body.startswith(f"// file: {header}"):
        return body
    if "/" in sid or sid.endswith((".ts", ".js", ".tsx", ".jsx", ".py", ".go", ".rs")):
        return f"// file: {sid}\n{body}"
    return f"### {header}\n\n{body}"


def evidence_and_gold_visibility(
    top: list[dict[str, Any]], gold: set[str], limit: int = EVIDENCE_LIMIT
) -> dict[str, Any]:
    parts = [format_section_evidence(c) for c in top]
    full = "\n\n".join(parts)
    truncated = full[:limit]
    pos = 0
    gold_start = gold_end = None
    for c in top:
        t = c.get("text") or ""
        start, end = pos, pos + len(t)
        if c["id"] in gold:
            gold_start = start if gold_start is None else gold_start
            gold_end = end
        pos = end + 2
    if gold_start is None:
        return {
            "blob_chars": len(full),
            "gold_window": "absent",
            "gold_frac_visible": 0.0,
            "truncated": truncated,
        }
    visible = max(0, min(gold_end, limit) - max(gold_start, 0))
    gold_len = max(1, gold_end - gold_start)
    if gold_start >= limit:
        window = "fully_out"
    elif gold_end > limit:
        window = "partial"
    else:
        window = "in"
    return {
        "blob_chars": len(full),
        "gold_window": window,
        "gold_start_char": gold_start,
        "gold_frac_visible": visible / gold_len,
        "truncated": truncated,
    }


def classify_model_failure(
    *,
    key: dict[str, Any],
    answer: str,
    not_found: bool,
    ans_ok: bool,
    gold_hit: bool,
    ans_in_evidence: bool,
    ans_in_gold_section: bool = False,
    ans_in_nongold_section: bool = False,
) -> str | None:
    """Map a gold@k row to a failure class (or None if answer+gold ok).

    Classes (user taxonomy):
      grader_reject          — near-correct wording/format; strict string grade fails
      cite_mismatch          — answer grades ok without gold in top-k (rare here)
      not_found_despite_gold — abstain though answer string is in the evidence window
      genuinely_wrong        — incorrect content (incl. distractor-section reads)
    """
    del ans_in_nongold_section, ans_in_gold_section  # row flags only; not a separate class
    if ans_ok and gold_hit:
        return None  # success
    if ans_ok and not gold_hit:
        return "cite_mismatch"
    gold = normalize(key.get("normalized_answer") or "")
    ans = normalize(answer)
    variants = [normalize(v) for v in (key.get("accepted_variants") or []) if v]
    if not_found or not ans:
        return "not_found_despite_gold" if ans_in_evidence else "not_found_answer_missing"
    # Near-miss / wording / format — grader rejected something that contains gold
    if gold and (gold in ans or ans in gold or any(v and (v in ans or ans in v) for v in variants)):
        return "grader_reject"
    g_toks = set(gold.split())
    a_toks = set(ans.split())
    if g_toks and len(g_toks & a_toks) / len(g_toks) >= 0.6:
        return "grader_reject"
    return "genuinely_wrong"


def diversify_wrong_sample(
    wrong: list[dict[str, Any]], sample_n: int
) -> list[dict[str, Any]]:
    """Round-robin across failure_class then stratum so the 30–50 sample isn't one bucket."""
    by_cls: dict[str, list[dict[str, Any]]] = {}
    for r in wrong:
        by_cls.setdefault(str(r.get("failure_class") or "other"), []).append(r)
    for lst in by_cls.values():
        lst.sort(key=lambda r: (r.get("stratum") or "", r.get("id") or ""))
    out: list[dict[str, Any]] = []
    keys = sorted(by_cls.keys())
    idx = {k: 0 for k in keys}
    while len(out) < sample_n and any(idx[k] < len(by_cls[k]) for k in keys):
        for k in keys:
            if idx[k] < len(by_cls[k]) and len(out) < sample_n:
                out.append(by_cls[k][idx[k]])
                idx[k] += 1
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--candidates",
        type=Path,
        default=ROOT / "design" / "rerank-candidates.jsonl",
    )
    ap.add_argument(
        "--ranks",
        type=Path,
        default=ROOT / "design" / "rerank-bakeoff-ranks.jsonl",
    )
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--offline-only", action="store_true")
    ap.add_argument("--model", default="google/gemini-2.5-flash-lite")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--sample", type=int, default=50, help="Max model-wrong rows to highlight")
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "gap-gold10-diagnose.json",
    )
    args = ap.parse_args()

    cands = {r["id"]: r for r in load_jsonl(args.candidates)}
    ranks = {r["id"]: r for r in load_jsonl(args.ranks)} if args.ranks.exists() else {}

    offline_rows: list[dict[str, Any]] = []
    for id_, r in cands.items():
        kw = ranks.get(id_, {}).get("rank_keyword")
        if kw is None:
            # compute from candidates
            top_probe = keyword_topk(r["candidates"], args.k)
            gold = set(r.get("gold_sections") or [])
            if not any(c["id"] in gold for c in top_probe):
                continue
            kw = next(
                (
                    i + 1
                    for i, c in enumerate(keyword_topk(r["candidates"], 10**9))
                    if c["id"] in gold
                ),
                None,
            )
        if kw is None or kw > args.k:
            continue
        top = keyword_topk(r["candidates"], args.k)
        gold = set(r.get("gold_sections") or [])
        vis = evidence_and_gold_visibility(top, gold)
        gold_text = "\n\n".join(c.get("text") or "" for c in top if c["id"] in gold)
        nongold_text = "\n\n".join(
            c.get("text") or "" for c in top if c["id"] not in gold
        )
        ans_in_gold = bool(extract_in_text(gold_text, r))
        ans_in_ev = bool(extract_in_text(vis["truncated"], r))
        offline_rows.append(
            {
                "id": id_,
                "stratum": r.get("stratum"),
                "split": r.get("split"),
                "question": r.get("question"),
                "question_type": r.get("question_type"),
                "normalized_answer": r.get("normalized_answer"),
                "accepted_variants": r.get("accepted_variants") or [],
                "gold_sections": r.get("gold_sections") or [],
                "kw_gold_rank": kw,
                "ans_in_gold_section": ans_in_gold,
                "ans_in_evidence_window": ans_in_ev,
                "gold_window": vis["gold_window"],
                "gold_frac_visible": vis["gold_frac_visible"],
                "blob_chars": vis["blob_chars"],
                "top_ids": [c["id"] for c in top],
                "_evidence": vis["truncated"],
                "_gold_text": gold_text,
                "_nongold_text": nongold_text,
            }
        )

    offline_summary = {
        "n_gold_at_k": len(offline_rows),
        "k": args.k,
        "ans_in_evidence_window_rate": (
            sum(1 for r in offline_rows if r["ans_in_evidence_window"]) / len(offline_rows)
            if offline_rows
            else None
        ),
        "ans_in_gold_section_rate": (
            sum(1 for r in offline_rows if r["ans_in_gold_section"]) / len(offline_rows)
            if offline_rows
            else None
        ),
        "gold_window_counts": dict(Counter(r["gold_window"] for r in offline_rows)),
        "note": (
            "If ans_in_evidence ≈ 1 but model accuracy ≪ that, the gap is reading/grading, "
            "not retrieval. 24k evidence truncate only explains gold_window=fully_out|partial."
        ),
    }

    report: dict[str, Any] = {
        "tag": "pageindex-ab-gap-gold10-diagnose-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "offline": offline_summary,
        "model": None,
        "failure_classes": None,
        "sample_wrong": [],
        "maxp_metric_note": (
            "Judge MaxP by model-scored accuracy + gold rank on CONTENT keys only "
            "(exclude depth_position templates). Always report position curves by "
            "question_eval_class — pooled rank→accuracy can be a template artifact."
        ),
    }

    rows_path = args.out.with_name(args.out.stem + "-rows.jsonl")

    if args.offline_only or not (
        os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    ):
        # Persist offline rows without evidence blobs for size
        slim = [
            {
                k: v
                for k, v in r.items()
                if not k.startswith("_")
            }
            for r in offline_rows
        ]
        rows_path.write_text("\n".join(json.dumps(x) for x in slim) + "\n")
        report["rows_path"] = str(rows_path)
        report["model"] = {
            "skipped": True,
            "reason": "offline_only or missing OPENROUTER_API_KEY",
        }
        report["note_grid_cells"] = (
            "Prior rerank-model-grid artifact saved aggregates only; per-row answers "
            "require this gap-diagnose pass (or a re-grid with *-rows.jsonl)."
        )
        args.out.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 0

    # Model finalize on gold@k keys
    classes: Counter[str] = Counter()
    out_rows: list[dict[str, Any]] = []

    def one(r: dict[str, Any]) -> dict[str, Any]:
        fin = finalize_answer(
            question=r["question"],
            evidence=r["_evidence"],
            model=args.model,
            question_type=r.get("question_type"),
        )
        answer = str(fin.get("answer") or "")
        not_found = bool(fin.get("not_found"))
        gold_hit = True  # filtered to gold@k
        ans_ok = grade(answer, not_found, r)
        ans_norm = normalize(answer)
        ans_in_gold_sec = bool(
            ans_norm and ans_norm in normalize(r.get("_gold_text") or "")
        )
        ans_in_nongold = bool(
            ans_norm and ans_norm in normalize(r.get("_nongold_text") or "")
        )
        cls = classify_model_failure(
            key=r,
            answer=answer,
            not_found=not_found,
            ans_ok=ans_ok,
            gold_hit=gold_hit,
            ans_in_evidence=r["ans_in_evidence_window"],
            ans_in_gold_section=ans_in_gold_sec,
            ans_in_nongold_section=ans_in_nongold,
        )
        return {
            **{k: v for k, v in r.items() if not k.startswith("_")},
            "model": args.model,
            "model_answer": answer,
            "model_not_found": not_found,
            "answer_ok": ans_ok,
            "strict_ok": ans_ok and gold_hit,
            "model_ans_in_gold_section": ans_in_gold_sec,
            "model_ans_in_nongold_section": ans_in_nongold,
            "failure_class": cls,
        }

    print(f"[gap] finalize n={len(offline_rows)} model={args.model}", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(one, r) for r in offline_rows]
        for i, fut in enumerate(as_completed(futs), 1):
            row = fut.result()
            out_rows.append(row)
            if row["failure_class"]:
                classes[row["failure_class"]] += 1
            else:
                classes["correct"] += 1
            if i % 20 == 0:
                print(f"[gap] {i}/{len(offline_rows)}", file=sys.stderr)

    n = len(out_rows)
    wrong = [r for r in out_rows if r["failure_class"] and r["failure_class"] != "correct"]
    sample = diversify_wrong_sample(wrong, args.sample)
    report["model"] = {
        "id": args.model,
        "n": n,
        "answer_accuracy": sum(1 for r in out_rows if r["answer_ok"]) / n if n else None,
        "strict_accuracy": sum(1 for r in out_rows if r["strict_ok"]) / n if n else None,
    }
    report["failure_classes"] = dict(classes)
    report["failure_class_rates"] = {
        k: v / n for k, v in classes.items()
    } if n else {}
    report["sample_wrong"] = [
        {
            "id": r["id"],
            "stratum": r["stratum"],
            "failure_class": r["failure_class"],
            "kw_gold_rank": r["kw_gold_rank"],
            "gold_window": r["gold_window"],
            "ans_in_evidence_window": r["ans_in_evidence_window"],
            "normalized_answer": r["normalized_answer"],
            "model_answer": (r["model_answer"] or "")[:300],
            "model_not_found": r["model_not_found"],
            "question": (r["question"] or "")[:200],
        }
        for r in sample
    ]
    for r in out_rows:
        r["question_eval_class"] = question_eval_class(r)
        r["is_depth_position_template"] = is_depth_position_template(r)
    report["position_by_question_class"] = position_curves_by_question_class(out_rows)
    depth = (report["position_by_question_class"].get("by_class") or {}).get(
        "depth_position"
    ) or {}
    content = report["position_by_question_class"].get("content_only") or {}
    report["implication"] = (
        "Split position curves by question_eval_class before treating rank→accuracy "
        "as a reading effect. Depth/position templates are not answerable from section "
        "text — fix/down-weight them; judge MaxP on content keys only. "
        f"content_acc={content.get('answer_accuracy')} "
        f"depth_acc={depth.get('answer_accuracy')}."
    )

    rows_path.write_text("\n".join(json.dumps(r) for r in out_rows) + "\n")
    report["rows_path"] = str(rows_path)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print(json.dumps({"ok": True, "wrote": str(args.out), "rows": str(rows_path)}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

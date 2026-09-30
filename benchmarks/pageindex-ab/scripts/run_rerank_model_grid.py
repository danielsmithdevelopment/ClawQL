#!/usr/bin/env python3
"""
Model-scored confirmation grid: k ∈ {10,20} × ±rerank.

Uses shared finalize_answer (flash-lite on all keys; optional Sonnet subset).
Requires OPENROUTER_API_KEY. Candidate pools from export_rerank_candidates.mjs;
reranked order from rerank-bakeoff-ranks.jsonl.

How to read results (locked):
  - norerank k=10 vs k=20  →  ship gate for TOP_K_DOC (the decision this grid makes)
  - ±rerank arms           →  bug reproduction if ranks came from a 512-cap bakeoff;
                              do NOT treat as the rerank ship/no-ship verdict.
                              Rerank is settled later by MaxP/blend/Qwen on tune,
                              confirmed on fresh keys (not the peeked holdout).

Grid cells:
  - k10_norerank, k20_norerank  (keyword top-k only — today's path at that k)
  - k10_rerank,   k20_rerank    (cross-encoder order from bakeoff ranks → top-k)

Usage:
  export OPENROUTER_API_KEY=…
  python3 benchmarks/pageindex-ab/scripts/run_rerank_model_grid.py \\
    --candidates design/rerank-candidates.jsonl \\
    --ranks design/rerank-bakeoff-ranks.jsonl \\
    --reranker gte \\
    --sonnet-n 60
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fair_test_common import finalize_answer  # noqa: E402
from question_templates import (  # noqa: E402
    position_curves_by_question_class,
    question_eval_class,
)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def normalize(s: str) -> str:
    import re

    t = (s or "").strip().lower()
    t = re.sub(r"[^\w\s.\-/%]", "", t)
    return re.sub(r"\s+", " ", t)


def grade(answer: str, not_found: bool, key: dict[str, Any]) -> bool:
    if key.get("unanswerable"):
        return bool(not_found)
    ans = normalize(answer)
    if not ans:
        return False
    variants = [key.get("normalized_answer"), *(key.get("accepted_variants") or [])]
    variants = [normalize(v) for v in variants if v]
    return any(v and (ans == v or v in ans or ans in v) for v in variants)


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = (t ^ (t >> 15)) * (1 | (t & 0xFFFFFFFF))
        t &= 0xFFFFFFFF
        t ^= t + (t ^ (t >> 7)) * (61 | (t & 0xFFFFFFFF))
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rng


def sample_ids(ids: list[str], n: int, seed: int) -> list[str]:
    if n <= 0 or n >= len(ids):
        return list(ids)
    rng = mulberry32(seed)
    arr = list(ids)
    for i in range(len(arr) - 1, 0, -1):
        j = int(rng() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr[:n]


def keyword_topk(cands: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    ordered = sorted(
        cands, key=lambda c: (c.get("kw_rank") is None, c.get("kw_rank") or 10**9)
    )
    # Prefer those with kw_rank; take first k among all union ordered by kw then rest
    return ordered[:k]


def rerank_topk_from_ranks(
    row: dict[str, Any], ranks_row: dict[str, Any] | None, reranker: str, k: int
) -> list[dict[str, Any]]:
    by_id = {c["id"]: c for c in row["candidates"]}
    if ranks_row:
        for key in (f"top20_{reranker}", f"top10_{reranker}"):
            ids = ranks_row.get(key)
            if ids:
                return [by_id[i] for i in ids[:k] if i in by_id]
    return keyword_topk(row["candidates"], k)


def evidence_blob(cands: list[dict[str, Any]]) -> str:
    return "\n\n".join(c.get("text") or "" for c in cands)[:24000]


def run_cell(
    rows: list[dict[str, Any]],
    ranks_by_id: dict[str, dict[str, Any]],
    *,
    k: int,
    use_rerank: bool,
    reranker: str,
    model: str,
    concurrency: int,
) -> dict[str, Any]:
    jobs = []
    for row in rows:
        if use_rerank:
            top = rerank_topk_from_ranks(row, ranks_by_id.get(row["id"]), reranker, k)
        else:
            top = keyword_topk(row["candidates"], k)
        gold = set(row.get("gold_sections") or [])
        gold_hit = (not gold) or any(c["id"] in gold for c in top)
        jobs.append((row, top, gold_hit))

    ok = 0
    strict = 0
    gold_hits = 0
    errors = 0
    per_rows: list[dict[str, Any]] = []

    def one(job):
        row, top, gold_hit = job
        try:
            fin = finalize_answer(
                question=row["question"],
                evidence=evidence_blob(top),
                model=model,
                question_type=row.get("question_type"),
            )
            answer = str(fin.get("answer") or "")
            not_found = bool(fin.get("not_found"))
            ans_ok = grade(answer, not_found, row)
            gold_ids = set(row.get("gold_sections") or [])
            rank_rec = ranks_by_id.get(row["id"]) or {}
            kw_gold_rank = rank_rec.get("rank_keyword")
            if kw_gold_rank is None:
                # Fallback: position within this cell's top list
                kw_gold_rank = next(
                    (i + 1 for i, c in enumerate(top) if c["id"] in gold_ids),
                    None,
                )
            return {
                "id": row["id"],
                "stratum": row.get("stratum"),
                "split": row.get("split"),
                "question": row.get("question"),
                "question_type": row.get("question_type"),
                "notes": row.get("notes"),
                "depth_position_template": row.get("depth_position_template"),
                "question_eval_class": question_eval_class(row),
                "kw_gold_rank": kw_gold_rank,
                "answer": answer,
                "not_found": not_found,
                "answer_ok": ans_ok,
                "strict_ok": ans_ok and gold_hit,
                "gold_hit": gold_hit,
                "top_ids": [c["id"] for c in top],
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            return {
                "id": row["id"],
                "stratum": row.get("stratum"),
                "split": row.get("split"),
                "question": row.get("question"),
                "question_type": row.get("question_type"),
                "notes": row.get("notes"),
                "depth_position_template": row.get("depth_position_template"),
                "question_eval_class": question_eval_class(row),
                "kw_gold_rank": row.get("kw_gold_rank"),
                "answer": "",
                "not_found": True,
                "answer_ok": False,
                "strict_ok": False,
                "gold_hit": gold_hit,
                "top_ids": [c["id"] for c in top],
                "error": str(e)[:200],
            }

    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futs = [ex.submit(one, j) for j in jobs]
        for fut in as_completed(futs):
            rec = fut.result()
            per_rows.append(rec)
            if rec.get("error"):
                errors += 1
            if rec["answer_ok"]:
                ok += 1
            if rec["strict_ok"]:
                strict += 1
            if rec["gold_hit"]:
                gold_hits += 1

    n = len(rows)
    return {
        "n": n,
        "answer_accuracy": ok / n if n else None,
        "strict_accuracy": strict / n if n else None,
        "gold_recall": gold_hits / n if n else None,
        "errors": errors,
        "k": k,
        "rerank": use_rerank,
        "model": model,
        "rows": per_rows,
    }


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
    ap.add_argument("--reranker", default="gte", help="bakeoff model key used in ranks")
    ap.add_argument("--flash-model", default="google/gemini-2.5-flash-lite")
    ap.add_argument("--sonnet-model", default="anthropic/claude-sonnet-4.6")
    ap.add_argument("--sonnet-n", type=int, default=60)
    ap.add_argument("--sonnet-seed", type=int, default=20261015)
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--ks", default="10,20")
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "rerank-model-grid.json",
    )
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    if not (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")):
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "OPENROUTER_API_KEY required for model-scored grid",
                    "hint": "Push GHA sentinel .run-rerank-grid or export the key locally",
                }
            ),
            file=sys.stderr,
        )
        return 2

    rows = load_jsonl(args.candidates)
    if args.limit:
        rows = rows[: args.limit]
    ranks_by_id = {}
    if args.ranks.exists():
        for r in load_jsonl(args.ranks):
            ranks_by_id[r["id"]] = r
    else:
        print(f"[warn] ranks missing: {args.ranks}", file=sys.stderr)

    ks = [int(x) for x in args.ks.split(",") if x.strip()]
    report: dict[str, Any] = {
        "tag": "pageindex-ab-rerank-model-grid-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reranker": args.reranker,
        "flash_model": args.flash_model,
        "sonnet_model": args.sonnet_model,
        "cells": {},
        "sonnet_subset": None,
        "recommendation": None,
    }

    all_row_dumps: list[dict[str, Any]] = []

    # Flash-lite full grid
    for k in ks:
        for use_rr in (False, True):
            name = f"k{k}_{'rerank' if use_rr else 'norerank'}_flash"
            print(f"[grid] {name} n={len(rows)}", file=sys.stderr)
            cell = run_cell(
                rows,
                ranks_by_id,
                k=k,
                use_rerank=use_rr,
                reranker=args.reranker,
                model=args.flash_model,
                concurrency=args.concurrency,
            )
            for rec in cell.pop("rows", []):
                all_row_dumps.append({"cell": name, **rec})
            report["cells"][name] = cell

    # Sonnet subset
    if args.sonnet_n > 0:
        ids = sample_ids([r["id"] for r in rows], args.sonnet_n, args.sonnet_seed)
        idset = set(ids)
        sub = [r for r in rows if r["id"] in idset]
        sonnet_cells = {}
        for k in ks:
            for use_rr in (False, True):
                name = f"k{k}_{'rerank' if use_rr else 'norerank'}_sonnet"
                print(f"[grid] {name} n={len(sub)}", file=sys.stderr)
                cell = run_cell(
                    sub,
                    ranks_by_id,
                    k=k,
                    use_rerank=use_rr,
                    reranker=args.reranker,
                    model=args.sonnet_model,
                    concurrency=min(args.concurrency, 2),
                )
                for rec in cell.pop("rows", []):
                    all_row_dumps.append({"cell": name, **rec})
                sonnet_cells[name] = cell
        report["sonnet_subset"] = {
            "n": len(sub),
            "seed": args.sonnet_seed,
            "ids": ids,
            "cells": sonnet_cells,
        }

    # Decision helpers
    flash = report["cells"]
    def strict(name: str) -> float:
        return float((flash.get(name) or {}).get("strict_accuracy") or 0)

    lift10 = strict("k10_rerank_flash") - strict("k10_norerank_flash")
    lift20 = strict("k20_rerank_flash") - strict("k20_norerank_flash")
    k20_vs_k10 = strict("k20_norerank_flash") - strict("k10_norerank_flash")
    # Ship top-k from norerank cells only. Rerank lifts here are truncation repro
    # when using 512-cap bakeoff ranks — not a product verdict.
    ship_20 = k20_vs_k10 >= 0.07 or strict("k20_norerank_flash") >= strict("k10_norerank_flash") + 0.05
    report["recommendation"] = {
        "flash_k20_vs_k10_norerank": k20_vs_k10,
        "ship_top_k": 20 if ship_20 else 10,
        "ship_top_k_metric": "norerank_flash_strict",
        "flash_rerank_lift_k10": lift10,
        "flash_rerank_lift_k20": lift20,
        "rerank_arms": "bug_reproduction_if_512_cap_ranks — not the rerank ship decision",
        "rerank_next": (
            "MaxP/blend/heading-path (or Qwen3-4B) on tune with full-text candidates; "
            "judge on CONTENT keys only (exclude depth_position templates); "
            "confirm on fresh builder keys — not holdout."
        ),
        "note": (
            "Ship TOP_K_DOC from norerank k10 vs k20 under model grade. "
            "Ignore ±rerank as a verdict until a non-truncated bakeoff wins tune. "
            "Always report position curves by question_eval_class."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    rows_out = args.out.with_name(args.out.stem + "-rows.jsonl")
    rows_out.write_text("\n".join(json.dumps(r) for r in all_row_dumps) + "\n")
    report["rows_path"] = str(rows_out)
    # Per-cell content-only + depth splits (k10 norerank flash is the MaxP baseline cell)
    for cell_name, cell in list(report["cells"].items()):
        cell_rows = [r for r in all_row_dumps if r.get("cell") == cell_name]
        # Enrich ranks from bakeoff when missing
        for r in cell_rows:
            if r.get("kw_gold_rank") is None and r["id"] in ranks_by_id:
                r["kw_gold_rank"] = ranks_by_id[r["id"]].get("rank_keyword")
        cell["position_by_question_class"] = position_curves_by_question_class(cell_rows)
        content = (cell["position_by_question_class"].get("content_only") or {})
        cell["content_answer_accuracy"] = content.get("answer_accuracy")
    report["maxp_metric_note"] = (
        "Judge MaxP by model-scored accuracy + gold rank on content keys only; "
        "publish position_by_question_class every run."
    )
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print(
        json.dumps({"ok": True, "wrote": str(args.out), "rows": str(rows_out)}),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

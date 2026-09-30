#!/usr/bin/env python3
"""
Cross-encoder rerank bakeoff on keyword∪vector top-100 pools.

Models (HF ids):
  - BAAI/bge-reranker-v2-m3          (lightweight baseline)
  - Alibaba-NLP/gte-reranker-modernbert-base  (149M; size≠quality candidate)
  - Qwen/Qwen3-Reranker-4B          (open-weight standard; needs GPU ~5090)

Pick by tune recall@10; confirm holdout. Also report recall@20 (interim TOP_K_DOC).

Usage:
  python3 benchmarks/pageindex-ab/scripts/run_rerank_bakeoff.py \\
    --candidates benchmarks/pageindex-ab/design/rerank-candidates.jsonl \\
    --models gte,bge

  # GPU machine:
  python3 ... --models gte,bge,qwen4b --device cuda
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "bge": {
        "hf": "BAAI/bge-reranker-v2-m3",
        "size": "~568M",
        "role": "lightweight baseline",
        "deploy": "CPU laptop OK",
    },
    "gte": {
        "hf": "Alibaba-NLP/gte-reranker-modernbert-base",
        "size": "149M",
        "role": "small high-quality candidate",
        "deploy": "CPU laptop OK",
        "trust_remote_code": True,
    },
    "qwen4b": {
        "hf": "Qwen/Qwen3-Reranker-4B",
        "size": "4B",
        "role": "open-weight standard (code-strong)",
        "deploy": "GPU (e.g. 5090) required in practice",
    },
    "qwen8b": {
        "hf": "Qwen/Qwen3-Reranker-8B",
        "size": "8B",
        "role": "larger open-weight optional",
        "deploy": "GPU required",
    },
}


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def best_gold_rank(ordered_ids: list[str], gold: list[str]) -> int | None:
    g = set(gold)
    best = None
    for i, cid in enumerate(ordered_ids):
        if cid in g:
            best = i + 1 if best is None else min(best, i + 1)
    return best


def recall_at(ranks: list[int | None], k: int) -> float | None:
    usable = [r for r in ranks if r is not None]
    if not usable:
        return None
    return sum(1 for r in usable if r <= k) / len(usable)


def summarize(rows: list[dict[str, Any]], rank_key: str) -> dict[str, Any]:
    ranks = [r.get(rank_key) for r in rows]
    pool_hits = sum(1 for r in rows if r.get("pool_has_gold"))
    by_stratum: dict[str, list[int | None]] = defaultdict(list)
    for r in rows:
        by_stratum[r.get("stratum") or "unknown"].append(r.get(rank_key))
    return {
        "n": len(rows),
        "pool_has_gold_rate": pool_hits / len(rows) if rows else None,
        "recall_at_10": recall_at(ranks, 10),
        "recall_at_20": recall_at(ranks, 20),
        "recall_at_100": recall_at(ranks, 100),
        "mean_rank": (
            sum(r for r in ranks if r is not None) / sum(1 for r in ranks if r is not None)
            if any(r is not None for r in ranks)
            else None
        ),
        "by_stratum": {
            s: {
                "n": len(v),
                "recall_at_10": recall_at(v, 10),
                "recall_at_20": recall_at(v, 20),
            }
            for s, v in sorted(by_stratum.items())
        },
    }


def baseline_keyword_ranks(rows: list[dict[str, Any]]) -> None:
    for r in rows:
        # Reconstruct keyword order from candidate kw_rank (nulls last)
        cands = r["candidates"]
        ordered = sorted(
            cands,
            key=lambda c: (c["kw_rank"] is None, c["kw_rank"] or 10**9),
        )
        # Only those that appeared in keyword top-pool; for fair baseline use kw_rank on full
        # Prefer stored keyword_gold_rank when present
        r["rank_keyword"] = r.get("keyword_gold_rank")
        r["rank_vector"] = r.get("vector_gold_rank")
        # Union order baseline (kw-first then vec-only) — no rerank
        union_ids = [c["id"] for c in cands]
        r["rank_union"] = best_gold_rank(union_ids, r["gold_sections"])


def load_cross_encoder(model_key: str, device: str):
    meta = MODEL_REGISTRY[model_key]
    try:
        from sentence_transformers import CrossEncoder
    except ImportError as e:
        raise SystemExit(
            "sentence-transformers required. "
            "pip install 'sentence-transformers>=3.0' torch --extra-index-url "
            "https://download.pytorch.org/whl/cpu"
        ) from e

    kwargs: dict[str, Any] = {"device": device}
    if meta.get("trust_remote_code"):
        kwargs["trust_remote_code"] = True
    # Qwen3 rerankers use causal-LM style in newer ST; pass through.
    print(f"[load] {model_key} → {meta['hf']} device={device}", file=sys.stderr)
    t0 = time.time()
    model = CrossEncoder(meta["hf"], **kwargs)
    print(f"[load] done in {time.time() - t0:.1f}s", file=sys.stderr)
    return model, meta


def rerank_rows(
    rows: list[dict[str, Any]],
    model,
    model_key: str,
    batch_size: int,
    max_length: int,
) -> None:
    rank_key = f"rank_{model_key}"
    if hasattr(model, "max_seq_length"):
        model.max_seq_length = max_length
    elif hasattr(model, "max_length"):
        model.max_length = max_length

    for i, r in enumerate(rows):
        pairs = [(r["question"], c["text"]) for c in r["candidates"]]
        if not pairs:
            r[rank_key] = None
            continue
        scores = model.predict(pairs, batch_size=batch_size, show_progress_bar=False)
        # numpy or list
        scored = list(zip(r["candidates"], scores))
        scored.sort(key=lambda x: float(x[1]), reverse=True)
        ordered_ids = [c["id"] for c, _ in scored]
        r[rank_key] = best_gold_rank(ordered_ids, r["gold_sections"])
        r[f"top10_{model_key}"] = ordered_ids[:10]
        r[f"top20_{model_key}"] = ordered_ids[:20]
        if (i + 1) % 10 == 0 or i + 1 == len(rows):
            print(f"[{model_key}] {i + 1}/{len(rows)}", file=sys.stderr)


def pick_winner(tune_summaries: dict[str, dict[str, Any]], model_keys: list[str]) -> str:
    best_key = model_keys[0]
    best_r = -1.0
    for k in model_keys:
        r10 = tune_summaries[k].get("recall_at_10") or 0.0
        if r10 > best_r + 1e-12:
            best_r = r10
            best_key = k
        elif abs(r10 - best_r) <= 0.02:
            # within 2pp — prefer smaller deploy footprint
            order = ["gte", "bge", "qwen4b", "qwen8b"]
            if order.index(k) < order.index(best_key):
                best_key = k
                best_r = r10
    return best_key


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--candidates",
        type=Path,
        default=Path("benchmarks/pageindex-ab/design/rerank-candidates.jsonl"),
    )
    ap.add_argument(
        "--models",
        default="gte,bge",
        help="Comma list: gte,bge,qwen4b,qwen8b",
    )
    ap.add_argument("--device", default="cpu", help="cpu | cuda | mps")
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--max-length", type=int, default=512)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("benchmarks/pageindex-ab/design/rerank-bakeoff.json"),
    )
    ap.add_argument("--limit", type=int, default=0, help="Debug: first N rows only")
    args = ap.parse_args()

    model_keys = [m.strip() for m in args.models.split(",") if m.strip()]
    for k in model_keys:
        if k not in MODEL_REGISTRY:
            raise SystemExit(f"unknown model key {k}; choose from {list(MODEL_REGISTRY)}")

    rows = load_rows(args.candidates)
    if args.limit > 0:
        rows = rows[: args.limit]
    baseline_keyword_ranks(rows)

    # Baselines
    report: dict[str, Any] = {
        "tag": "pageindex-ab-rerank-bakeoff-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "candidates": str(args.candidates),
        "device": args.device,
        "batch_size": args.batch_size,
        "max_length": args.max_length,
        "pool": "keyword_topN ∪ vector_topN (N from export; default 100)",
        "models_requested": model_keys,
        "model_registry": {k: MODEL_REGISTRY[k] for k in MODEL_REGISTRY},
        "baselines": {},
        "rerankers": {},
        "recommendation": {},
    }

    for split in ("tune", "holdout"):
        sub = [r for r in rows if r["split"] == split]
        report["baselines"][split] = {
            "keyword": summarize(sub, "rank_keyword"),
            "vector": summarize(sub, "rank_vector"),
            "union_no_rerank": summarize(sub, "rank_union"),
        }

    ran: list[str] = []
    skipped: dict[str, str] = {}
    for key in model_keys:
        try:
            model, meta = load_cross_encoder(key, args.device)
        except Exception as e:  # noqa: BLE001 — record and continue bakeoff
            skipped[key] = str(e)[:500]
            print(f"[skip] {key}: {e}", file=sys.stderr)
            continue
        t0 = time.time()
        rerank_rows(rows, model, key, args.batch_size, args.max_length)
        elapsed = time.time() - t0
        del model
        ran.append(key)
        report["rerankers"][key] = {
            "meta": meta,
            "elapsed_sec": elapsed,
            "tune": summarize([r for r in rows if r["split"] == "tune"], f"rank_{key}"),
            "holdout": summarize(
                [r for r in rows if r["split"] == "holdout"], f"rank_{key}"
            ),
        }

    report["models_ran"] = ran
    report["models_skipped"] = skipped

    if ran:
        tune_sums = {k: report["rerankers"][k]["tune"] for k in ran}
        winner = pick_winner(tune_sums, ran)
        w_tune = report["rerankers"][winner]["tune"]
        w_hold = report["rerankers"][winner]["holdout"]
        kw_tune = report["baselines"]["tune"]["keyword"]["recall_at_10"] or 0
        report["recommendation"] = {
            "winner": winner,
            "hf": MODEL_REGISTRY[winner]["hf"],
            "deploy": MODEL_REGISTRY[winner]["deploy"],
            "tune_recall_at_10": w_tune.get("recall_at_10"),
            "holdout_recall_at_10": w_hold.get("recall_at_10"),
            "tune_lift_vs_keyword_r10": (w_tune.get("recall_at_10") or 0) - kw_tune,
            "holdout_lift_vs_keyword_r10": (w_hold.get("recall_at_10") or 0)
            - (report["baselines"]["holdout"]["keyword"]["recall_at_10"] or 0),
            "product_default": (
                "Prefer gte (149M) as CPU default if within 2pp of winner; "
                "offer qwen4b where GPU available."
                if winner != "gte" and "gte" in ran
                else f"Default to {winner} ({MODEL_REGISTRY[winner]['deploy']})."
            ),
            "fusion_note": (
                "Reranking keyword∪vector union makes a separate RRF fusion switch "
                "unnecessary for this failure mode — purge-inventory candidate."
            ),
            "next": (
                "Model-scored grid: k∈{10,20} × ±rerank on flash-lite + Sonnet subset "
                "(run_rerank_model_grid.py / GHA)."
            ),
        }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    # Compact per-row ranks for later grid
    ranks_path = args.out.with_name("rerank-bakeoff-ranks.jsonl")
    with ranks_path.open("w") as f:
        for r in rows:
            f.write(
                json.dumps(
                    {
                        "id": r["id"],
                        "split": r["split"],
                        "stratum": r["stratum"],
                        "pool_has_gold": r["pool_has_gold"],
                        "rank_keyword": r.get("rank_keyword"),
                        "rank_vector": r.get("rank_vector"),
                        "rank_union": r.get("rank_union"),
                        **{f"rank_{k}": r.get(f"rank_{k}") for k in ran},
                        **{f"top10_{k}": r.get(f"top10_{k}") for k in ran},
                        **{f"top20_{k}": r.get(f"top20_{k}") for k in ran},
                    }
                )
                + "\n"
            )
    print(json.dumps(report, indent=2))
    print(json.dumps({"ok": True, "wrote": str(args.out), "ranks": str(ranks_path)}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

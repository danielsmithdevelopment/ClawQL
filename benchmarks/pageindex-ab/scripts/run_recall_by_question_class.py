#!/usr/bin/env python3
"""Offline recall@k split by question_eval_class (no API).

Re-slices the k-grid retrieval curve so depth/position templates cannot
drive TOP_K_DOC. Writes design/recall-by-question-class.json (+ .md).
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys_path = Path(__file__).resolve().parent

import sys

sys.path.insert(0, str(sys_path))
from question_templates import (  # noqa: E402
    is_depth_position_template,
    question_eval_class,
)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def gold_rank(row: dict[str, Any], ranks: dict[str, dict[str, Any]]) -> int | None:
    gold = set(row.get("gold_sections") or [])
    if not gold:
        return None
    rr = ranks.get(row["id"])
    if rr and rr.get("rank_keyword") is not None:
        return int(rr["rank_keyword"])
    if row.get("keyword_gold_rank") is not None:
        return int(row["keyword_gold_rank"])
    ordered = sorted(
        row.get("candidates") or [],
        key=lambda c: (c.get("kw_rank") is None, c.get("kw_rank") or 10**9),
    )
    for i, c in enumerate(ordered):
        if c["id"] in gold:
            return i + 1
    return None


def recall_curve(
    rows: list[dict[str, Any]],
    ranks: dict[str, dict[str, Any]],
    ks: list[int],
) -> dict[str, Any]:
    scored: list[tuple[dict[str, Any], int]] = []
    for r in rows:
        if r.get("unanswerable"):
            continue
        if r.get("exclude_from_recall_scoring") or is_depth_position_template(r):
            # Caller may still pass depth rows into a depth bucket explicitly.
            pass
        rk = gold_rank(r, ranks)
        if rk is None:
            continue
        if not (r.get("gold_sections") or []):
            continue
        scored.append((r, rk))
    n = len(scored)
    by_k = {}
    for k in ks:
        hits = sum(1 for _, rk in scored if rk <= k)
        by_k[str(k)] = {"hits": hits, "n": n, "recall": hits / n if n else None}
    return {"n": n, "by_k": by_k}


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
    ap.add_argument("--ks", default="3,5,10,20,50,100")
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "recall-by-question-class.json",
    )
    args = ap.parse_args()
    ks = [int(x) for x in args.ks.split(",") if x.strip()]
    rows = load_jsonl(args.candidates)
    ranks = {r["id"]: r for r in load_jsonl(args.ranks)} if args.ranks.exists() else {}

    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        buckets[question_eval_class(r)].append(r)

    # Scoring sets: pooled-all (legacy), content, depth, code_export, content+code
    report: dict[str, Any] = {
        "tag": "pageindex-ab-recall-by-question-class-v1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_keys": len(rows),
        "class_counts": {k: len(v) for k, v in sorted(buckets.items())},
        "curves": {},
        "verdict": None,
    }

    report["curves"]["all_legacy_pooled"] = recall_curve(rows, ranks, ks)
    for name in ("content", "depth_position", "code_export"):
        report["curves"][name] = recall_curve(buckets.get(name, []), ranks, ks)
    report["curves"]["content_plus_code_export"] = recall_curve(
        buckets.get("content", []) + buckets.get("code_export", []), ranks, ks
    )

    c10 = report["curves"]["content"]["by_k"].get("10", {}).get("recall")
    c20 = report["curves"]["content"]["by_k"].get("20", {}).get("recall")
    d10 = report["curves"]["depth_position"]["by_k"].get("10", {}).get("recall")
    d20 = report["curves"]["depth_position"]["by_k"].get("20", {}).get("recall")
    a10 = report["curves"]["all_legacy_pooled"]["by_k"].get("10", {}).get("recall")
    a20 = report["curves"]["all_legacy_pooled"]["by_k"].get("20", {}).get("recall")

    report["verdict"] = {
        "content_recall_k10": c10,
        "content_recall_k20": c20,
        "content_k20_lift": (c20 - c10) if c10 is not None and c20 is not None else None,
        "depth_recall_k10": d10,
        "depth_recall_k20": d20,
        "pooled_k20_lift": (a20 - a10) if a10 is not None and a20 is not None else None,
        "ship_top_k_content": (
            10
            if (c20 is None or c10 is None or (c20 - c10) < 0.05)
            else 20
        ),
        "note": (
            "Depth/position templates excluded from MaxP / TOP_K_DOC content decision. "
            "Pooled R@10→R@20 climb is depth-only when content is already saturated. "
            "Prior model k=10 lock stands for content if content R@20 lift < 5pp. "
            "MaxP: content recall@10 + content model accuracy (not position within top-10)."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")

    md = args.out.with_suffix(".md")
    lines = [
        "# Recall@k by question class (offline)",
        "",
        f"Generated `{report['generated_at']}`. No API spend.",
        "",
        f"Class counts: `{report['class_counts']}`",
        "",
        "| class | n | " + " | ".join(f"R@{k}" for k in ks) + " |",
        "| ----- | - | " + " | ".join("---" for _ in ks) + " |",
    ]
    for name, curve in report["curves"].items():
        cells = []
        for k in ks:
            r = curve["by_k"][str(k)]["recall"]
            cells.append(f"{r:.3f}" if r is not None else "—")
        lines.append(f"| `{name}` | {curve['n']} | " + " | ".join(cells) + " |")
    v = report["verdict"]
    lines += [
        "",
        "## Verdict",
        "",
        f"- Content R@10 → R@20: **{v['content_recall_k10']} → {v['content_recall_k20']}** "
        f"(lift {v['content_k20_lift']})",
        f"- Depth R@10 → R@20: **{v['depth_recall_k10']} → {v['depth_recall_k20']}** "
        f"(this is the pooled climb)",
        f"- Ship TOP_K_DOC for content: **{v['ship_top_k_content']}**",
        "",
        v["note"],
        "",
        "## MaxP metrics",
        "",
        "- Primary: **content recall@10** + **content model accuracy**",
        "- Do not optimize position-within-top-10 on this keyset when content golds "
        "already sit at rank ≤2",
        "- Exclude `depth_position` from recall scoring; optional separate structural track "
        "with section#/% headers",
        "",
    ]
    md.write_text("\n".join(lines))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# Track C — H-idf k-sweep (default top-k)

**Status:** ship interim — **`TOP_K_DOC` 3 → 20** (offline); ranking fixes next  
**Artifact:** [`k-sweep-hidf.json`](k-sweep-hidf.json)  
**Runner:** `node benchmarks/pageindex-ab/scripts/run_k_sweep.mjs --ks 3,6,10,20`  
**Scoring:** **offline extractAnswer** (answer string in retrieved text) — not model-scored  
**Set:** hard-candidate, n=358 (262 with gold sections)

## Verdict

Retrieval depth is the bottleneck under today's keyword ranker. Gold@3 is only **0.485**; gold@20 is **0.775** (+29.0pp). Offline **strict** accuracy rises **0.592 → 0.813** (+22.1pp). That clears the ~7–8pp detection bar on this set and beats every add-on previously tested (PageIndex, BM25, query rewrite).

**Default:** `TOP_K_DOC = 20` in [`retrieval_helpers.mjs`](../scripts/retrieval_helpers.mjs) — ship this meanwhile. Raising k works around weak ranking; fixing ranking (see [`gold-rank-diagnostics.md`](gold-rank-diagnostics.md)) is the complementary, better long-term fix.

> Offline scores show the answer **reaches** context, not that a model **uses** it. Confirm with model-scored finalize (`--llm`) before treating the +22pp as a product accuracy claim. Pilot H-idf strict **0.536** on this set used the same offline path with a slightly different citeOk (citation F1>0 vs gold-id-in-top-k) — both offline; the 0.536 vs 0.592 gap is grading, not model vs extract.

## Results (H-idf, offline extractAnswer)

| k  | gold_recall | answer_accuracy | strict_accuracy | Δ strict vs k=3 | leakage (of answers) |
| -- | ----------- | --------------- | --------------- | --------------- | -------------------- |
| 3  | 0.485       | 0.782           | 0.592           | —               | 68 (24%)             |
| 6  | 0.569       | 0.841           | 0.662           | +7.0pp          | 64                   |
| 10 | 0.653       | 0.872           | 0.723           | +13.1pp         | 53                   |
| 20 | 0.775       | 0.916           | 0.813           | **+22.1pp**     | 37 (11%)             |

Gold still climbs k=10→20 (+12.2pp). Exploratory **k=40**: gold ≈0.855, strict ≈0.872 (+5.9pp vs k=20) — under the single-step ~7–8pp bar; do not raise past 20 on that alone.

## Context explains the answers (not H-none=0)

At every k, **strict_accuracy ≤ answer_accuracy** (e.g. 0.592 vs 0.782 at k=3; 0.813 vs 0.916 at k=20). Strict requires gold-in-top-k (when gold exists) plus an answer match; answer_accuracy only needs the answer string in retrieved text. The persistent gap means graded-correct cases remain explainable by what was in context — including non-gold sections that carry the same fact (“leakage”).

Offline empty-evidence extract scores 0 on answerable keys **by construction** (no text to extract from) and **cannot** rule out model training memory. Do not cite H-none offline as anti-memory evidence. True memory measurement needs LLM finalize on empty evidence (`--llm-none` + OpenRouter).

## Recommendation lock

| Field | Value |
| ----- | ----- |
| Eval / harness top-k | **20** (interim ship) |
| Metric that drove the raise | offline `strict_accuracy` |
| Max strict gain vs k=3 | +22.1pp |
| Max gold gain vs k=3 | +29.0pp |
| Next | gold-rank diagnostics → contextual headers → reranker (dev split; confirm holdout / fresh keys) |

## Track B (unchanged)

All 12 CodeGraph prove keys remain grep-insoluble; additive `A-codegraph` locked. Settle before **2026-10-15**.

## Follow-ups

1. [`gold-rank-diagnostics.md`](gold-rank-diagnostics.md) — keyword / vector / RRF / contextual-header ranks + miss classes.
2. Model-scored k-sweep (`--llm`) when OpenRouter is available.
3. Track B spend (additive CodeGraph).

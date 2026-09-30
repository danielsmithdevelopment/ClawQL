# Track C — H-idf k-sweep (default top-k)

**Status:** **`TOP_K_DOC` locked at 10** (model-scored grid) — offline had preferred 20; model grade did not follow  
**Artifacts:** [`k-sweep-hidf.json`](k-sweep-hidf.json), [`rerank-model-grid.json`](rerank-model-grid.json)  
**Runner:** offline `run_k_sweep.mjs`; model gate `run_rerank_model_grid.py` / GHA `.run-rerank-grid`  
**Set:** hard-candidate (offline n=358; model grid n=262 with gold)

## Verdict

**`TOP_K_DOC = 10` still locked — now for the right reason.** Free re-slice by question class ([`recall-by-question-class.md`](recall-by-question-class.md)):

| class | R@10 | R@20 | lift |
| ----- | ---- | ---- | ---- |
| content | **1.000** | **1.000** | 0 |
| depth_position | 0.409 | 0.617 | +21pp |
| pooled (legacy) | 0.653 | 0.775 | +12pp |

Content recall is already saturated at k≤3; the pooled climb is depth templates (excluded from recall scoring). Content model accuracy when gold ∈ top-10 is ~100%. k=20 cannot help content on this set.

**Default:** `TOP_K_DOC = 10` in [`retrieval_helpers.mjs`](../scripts/retrieval_helpers.mjs). MaxP: content recall@10 + content model accuracy (grow harder content keys — no headroom on current content ranks).

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
| Eval / harness top-k | **10** (model-scored lock) |
| Offline preferred | 20 (+22.1pp offline strict) — **overruled by model grade** |
| Model norerank k20−k10 | flash **−0.4pp**; Sonnet **0pp** |
| Next | MaxP/blend/hdr on tune (full-text candidates); confirm on fresh keys — see [`rerank-bakeoff.md`](rerank-bakeoff.md) |

## Track B (unchanged)

All 12 CodeGraph prove keys remain grep-insoluble; additive `A-codegraph` locked. Settle before **2026-10-15**.

## Follow-ups

1. [`gold-rank-diagnostics.md`](gold-rank-diagnostics.md) — keyword / vector / RRF / contextual-header ranks + miss classes.
2. Model-scored k-sweep (`--llm`) when OpenRouter is available.
3. Track B spend (additive CodeGraph).

# Track C — H-idf k-sweep (default top-k)

**Status:** decided — **raise eval/default section top-k from 3 → 20**  
**Artifact:** [`k-sweep-hidf.json`](k-sweep-hidf.json)  
**Runner:** `node benchmarks/pageindex-ab/scripts/run_k_sweep.mjs --ks 3,6,10,20`  
**Set:** hard-candidate, n=358 (262 with gold sections)

## Verdict

Retrieval depth is the bottleneck. Gold@3 is only **0.485**; gold@20 is **0.775** (+29.0pp). Offline **strict** accuracy (answer ∩ gold-in-top-k, or unanswerable) rises **0.592 → 0.813** (+22.1pp). That clears the ~7–8pp detection bar on this set by a wide margin and beats every add-on previously tested (PageIndex, BM25, query rewrite).

**Default:** `TOP_K_DOC = 20` in [`retrieval_helpers.mjs`](../scripts/retrieval_helpers.mjs).

## Results (H-idf, offline extractAnswer)

| k  | gold_recall | answer_accuracy | strict_accuracy | Δ strict vs k=3 | leakage (of answers) |
| -- | ----------- | --------------- | --------------- | --------------- | -------------------- |
| 3  | 0.485       | 0.782           | 0.592           | —               | 68 (24%)             |
| 6  | 0.569       | 0.841           | 0.662           | +7.0pp          | 64                   |
| 10 | 0.653       | 0.872           | 0.723           | +13.1pp         | 53                   |
| 20 | 0.775       | 0.916           | 0.813           | **+22.1pp**     | 37 (11%)             |

Gold still climbs k=10→20 (+12.2pp). Exploratory **k=40**: gold ≈0.855, strict ≈0.872 (+5.9pp vs k=20) — under the single-step ~7–8pp bar; do not raise past 20 on that alone. Revisit if product context budget is free and an LLM-graded sweep confirms.

## No-retrieval arm (H-none)

| Mode | answer_accuracy | answerable_accuracy | Note |
| ---- | --------------- | ------------------- | ---- |
| Offline extract on empty evidence | 0.101 | **0.000** | Only the 36 unanswerable keys score (`not_found`) |

Offline H-none cannot measure LLM training memory. The earlier gap (answer_accuracy 0.536 pilot / 0.782 offline@k=3 vs gold_recall 0.485) is **section leakage** — the fact string appears in a non-gold top-k section — not model memory. True memory baseline needs `OPENROUTER_API_KEY` + `--llm-none` (flash-lite finalize on empty evidence). Until that runs, treat leakage as a gold/mapper hygiene signal, not as “the model already knew RFCs.”

## Why accuracy beat gold@3 on the pilot

Pilot H-idf strict was **0.536** with gold-in-top-3 ≈ **0.43**. Offline here: answer@3 **0.782** vs gold@3 **0.485**, with **68** leakage cases. Same story: duplicate facts across sections inflate answer-only grades. Strict (answer ∧ gold-in-top) is the metric that should drive top-k.

## Recommendation lock

| Field | Value |
| ----- | ----- |
| Current eval top-k | 3 |
| Suggested eval / harness top-k | **20** |
| Raise default | **yes** |
| Metric | `strict_accuracy` |
| Max strict gain vs k=3 | +22.1pp |
| Max gold gain vs k=3 | +29.0pp |

Cost is not a constraint on this harness. Product `memory_recall` still uses the caller `limit`; this change is the **pageindex-ab / vault-section** default used by pilots and displacement checks.

## Track B (unchanged)

All 12 CodeGraph prove keys remain grep-insoluble; additive `A-codegraph` (grep + CodeGraph) is locked. Settle live spend before the **2026-10-15** freeze — see [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json) and [`agent-loop-freeze.md`](agent-loop-freeze.md).

## Follow-ups

1. Run `--llm-none` when an OpenRouter key is available (true H-none memory arm).
2. Optional LLM-graded k-sweep at k∈{10,20,40} if finalize quality diverges from extractAnswer.
3. Track B spend (additive CodeGraph) on the locked prove + no-harm cohorts.

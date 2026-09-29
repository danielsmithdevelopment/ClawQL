# VectifyAI PageIndex fair test (freeze-critical)

## Gap

ClawQL’s shipped `pageindex_*` / hybrid RRF path is a **deterministic heading tree + lexical merge**. That is **not** how VectifyAI designed PageIndex. Their product is:

1. **Index:** tree with **LLM-written node summaries**
2. **Retrieve:** a **strong model navigates** the tree (reasoning, not similarity)

Judging `pageindex_*` only on our ranker-mode A/B would purge (or keep) the wrong thing. The fair test uses **their MIT implementation as-is** — no ClawQL port until it wins.

## Cohort

The **12 deep RFC retrieval misses** (IDF `gold_rank > 10`) — outside k-sweep recovery. See [`deep-rfc-misses.json`](deep-rfc-misses.json).

Side-by-side arms on **this cohort only** (not full 150):

| Arm id | Method |
| ------ | ------ |
| `H-idf` | Today’s default, top-k=3 (baseline on the 12) |
| `H-idf-qrewrite` | Multi-query rewrite + IDF union (pennies) |
| `D-vectify-pi` | Upstream `pageindex` SDK local mode: LLM summaries + strong chat model over the tree |

## Decision rule (graded)

- Primary: strict accuracy on the 12 (same grader as agent-lite).
- Report n=12 and exact/sign-test vs `H-idf-qrewrite`.
- **If Vectify cannot beat query-rewrite on this cohort → purge `pageindex_*` with confidence** (no port).
- **If Vectify wins →** that defines what to port into ClawQL (summaries + tree navigation), not RRF merge.

Smoke / contaminated-smoke do **not** count ([purge evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules)).

## How to run (no ClawQL build)

Upstream local `submit_document` is **PDF-only**. The runner bridges hard-candidate Markdown RFCs → text PDFs (no ClawQL tree build), then uses `PageIndexClient(index=…, chat=…)` as-is.

```bash
pip install -U pageindex

# Dry-run: cohort + PDFs only (no keys)
python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py --dry-run

# Side-by-side query-rewrite on the same 12 (heuristic or LLM)
python3 benchmarks/pageindex-ab/scripts/run_query_rewrite_cohort.py --heuristic-only

# Live Vectify arm — needs OPENAI_API_KEY or OPENROUTER_API_KEY
export OPENROUTER_API_KEY=…   # or OPENAI_API_KEY
python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py \
  --index-model gpt-4o-mini \
  --chat-model gpt-4o \
  --out benchmarks/pageindex-ab/results/vectify-fair/
```

| Script | Role |
| ------ | ---- |
| [`../scripts/run_vectify_fair_test.py`](../scripts/run_vectify_fair_test.py) | `D-vectify-pi` — upstream SDK index + chat |
| [`../scripts/run_query_rewrite_cohort.py`](../scripts/run_query_rewrite_cohort.py) | `H-idf-qrewrite` on the same 12 |

Artifacts under `results/vectify-fair/`: `pdfs/`, `store/`, `answers-*.jsonl`, `grades-*.jsonl`, `summary-*.json`.

Recommended models (cost/quality):

| Role | Cheap prove | Strong prove |
| ---- | ----------- | ------------ |
| index (summaries) | `gpt-4o-mini` / flash-lite | same is fine |
| chat (tree nav) | — | **best affordable** (gpt-4o / claude / o-series) |

## Scheduling (freeze 2026-10-15)

**Do not wait** for k-sweep to finish before starting this. Critical path for two purge decisions:

| Track | Work | Blocks |
| ----- | ---- | ------ |
| **A (parallel)** | Vectify fair test on 12 + query-rewrite on same 12 | Port-vs-purge for PageIndex *design* |
| **B (parallel, start now)** | Strong-model agent loop: ClawQL `pageindex_*` + `codegraph_*` vs **grep** — [agent-loop-freeze.md](agent-loop-freeze.md) | Catalog keep/purge |
| **C (can lag)** | k-sweep `{3,6,10}` + union matched-k on today | union confound / default k only |

Union’s rescore edge is **+2 questions** (0.840 → 0.853) — even more likely k-explained; track C is not freeze-gating for PageIndex catalog purge.

If Vectify wins A but ClawQL tools lose B → **port** summaries + tree nav; do not keep the thin ranker-mode tools as-is.

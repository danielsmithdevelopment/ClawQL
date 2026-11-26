# Track C — gold-rank diagnostics (ranking fixes)

**Status:** diagnosed — **rerank is the bottleneck**; ship `TOP_K_DOC=20` meanwhile  
**Artifacts:** [`gold-rank-diagnostics.json`](gold-rank-diagnostics.json), [`gold-rank-diagnostics-rows.jsonl`](gold-rank-diagnostics-rows.jsonl)  
**Runner:** `node benchmarks/pageindex-ab/scripts/run_gold_rank_diagnostics.mjs`  
**Hygiene:** stratified **tune 60% / holdout 40%** (seed `20261015`). Tune = development signal only. Confirm on holdout here, then on fresh builder keys + human sample before claiming a product win. The signed set already drove the k-sweep — do not keep tuning on “all”.

## Why this exists

Raising k from 3→20 is worth **+22pp offline strict**, but it works around weak ranking. Fixing ranking gets the right section into the top of the list — better for top-20 too, and for clients with small context budgets.

## Pattern (tune, n=156 with gold; docs-only n=142)

| Method | recall@10 | recall@50 | recall@100 |
| ------ | --------- | --------- | ---------- |
| keyword IDF (today) | **0.599** | **0.866** | **0.979** |
| vector (MiniLM) | 0.599 | 0.859 | 0.979 |
| RRF(keyword, vector) | 0.620 | 0.845 | 0.979 |
| keyword + heading-path context | 0.606 | 0.866 | 0.979 |
| RRF + context | 0.634 | 0.859 | 0.979 |

Holdout docs-only mirrors this (keyword@10 **0.646**, @50 **0.875**, @100 **0.958**).

### Miss classes among keyword@10 misses (tune 57)

| Class | n | Meaning |
| ----- | - | ------- |
| **rerank** | **32** | best gold rank in (10, 50] |
| **deep_rerank** | **8** | best gold rank in (50, 100] |
| vector_rescue | 8 | vector ≤10 while keyword >10 |
| merge | 3 | lone ≤10 but RRF buries it |
| contextual_header_fix | 1 | heading-path alone fixes the miss |
| index_mismatch | ~0 | gold outside top-100 |

**Ceiling:** a perfect reranker over keyword top-50 → top-10 would lift tune docs recall@10 by **~+26.8pp** (0.599 → 0.866). Top-100 ceiling is ~+38pp. That is the same order of magnitude as the k=3→20 offline strict gain — but at **k=10**.

## Decisions

| Hypothesis | Result | Action |
| ---------- | ------ | ------ |
| Merge buries golds | Rare (3 tune misses) | Do **not** prioritize `CLAWQL_MEMORY_RECALL_HYBRID` / RRF for this failure mode |
| Need reranker | **Yes** — 40/57 misses in ranks 11–100 | **Next:** cross-encoder over keyword top-50 → keep 10/20 (local 5090) |
| Contextual heading path | **No ship** — <1pp lift on tune docs; wash/slight regression on holdout | Deterministic `Doc › H1 › H2` prepend is not enough on RFCs |
| Index/wording mismatch | Almost none (@100 ≈ 0.98) | LLM-written one-sentence context still optional if deep misses remain after rerank |

## Ship plan

1. **Keep `TOP_K_DOC=20`** (interim) — already applied; improves what clients receive today.
2. **Implement cross-encoder rerank** (dev on tune, confirm holdout recall@10, then model-scored accuracy).
3. **Do not** claim ranking wins from the full signed set without a fresh-key confirm pass.
4. Optional later: Anthropic-style **LLM contextual retrieval** (stronger than heading path) if rerank leaves deep misses.

## Related

- Offline k-sweep / TOP_K_DOC raise: [`k-sweep-hidf.md`](k-sweep-hidf.md)
- Track B CodeGraph freeze: [`agent-loop-freeze.md`](agent-loop-freeze.md)

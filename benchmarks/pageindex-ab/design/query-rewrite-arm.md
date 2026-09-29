# Query-rewrite arm (before full agent loop)

## Why

Of 15 RFC retrieval misses under `H-idf` (top-k=3), offline gold ranks show only **3/15** in ranks 4–10. The other **12** sit outside useful k — the question wording does not match the text. Raising k alone will not clear them.

## Arm

| Field   | Value                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id      | `H-idf-qrewrite`                                                                                                                                                                    |
| Control | `H-idf` (same top-k after merge)                                                                                                                                                    |
| Method  | One cheap model call rewrites the question into 2–3 alternate queries; retrieve each with today's IDF vault ranker; **union** section ids (dedupe, preserve best score); take top-k |
| Model   | flash-lite (or cheaper) — pennies at n=150                                                                                                                                          |
| Gate    | Strict accuracy vs `H-idf` on the **150-key** corpus; report n and sign-test / McNemar                                                                                              |

If this recovers most of the 12 deep misses, the rewrite step is a candidate for **`memory_recall` default path** (helps every client, including those without a strong agent loop). If not, proceed to strong-model agent loop + grep.

## Suggested spend order (updated for freeze)

1. **Re-score** on 150 keys (free; filter saved cells) — done (`design/agent-rescore-150.json`).
2. **Track A (parallel, now):** this arm on the [12 deep RFC misses](deep-rfc-misses.json) **side-by-side** with [Vectify fair test](vectify-fair-test.md) (`run_query_rewrite_cohort.py` + `run_vectify_fair_test.py`).
3. **Track B (parallel, schedule now):** strong-model [agent loop](agent-loop-freeze.md) — ClawQL `pageindex_*` + `codegraph_*` vs grep (prove-or-purge).
4. **Track C (can lag):** k-sweep `{3,6,10}` + union matched-k (~$0.50) — union confound only; not freeze-gating for catalog purge.

## Not this arm

- Not PageIndex (see Vectify fair test for that).
- Not multi-turn tool use (see agent-loop freeze).
- Not changing the default until graded evidence passes the [purge inventory evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules).

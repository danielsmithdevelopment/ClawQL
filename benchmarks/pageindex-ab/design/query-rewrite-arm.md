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

## Suggested spend order

1. **Re-score** on 150 keys (free; filter saved cells) — done (`design/agent-rescore-150.json`).
2. **Query-rewrite arm** (pennies).
3. **k-sweep** `{3,6,10}` on today's default + **union matched-k control** (~$0.50).
4. **Strong-model agent loop** with separate tools including grep (prove-or-purge for `pageindex_*` / `codegraph_*`).

## Not this arm

- Not PageIndex.
- Not multi-turn tool use.
- Not changing the default until graded evidence passes the [purge inventory evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules).

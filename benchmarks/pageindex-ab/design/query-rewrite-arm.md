# Query-rewrite arm (before full agent loop)

## Why

Of 15 RFC retrieval misses under `H-idf` (top-k=3), offline gold ranks show only **3/15** in ranks 4–10. The other **12** sit outside useful k — the question wording does not match the text. Raising k alone will not clear them.

## Arm

| Field   | Value                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id      | `H-idf-qrewrite`                                                                                                                                                                    |
| Control | `H-idf` (same top-k after merge)                                                                                                                                                    |
| Method  | One cheap model call rewrites the question into 2–3 alternate queries; retrieve each with today's IDF vault ranker; **union** section ids (dedupe, preserve best score); take top-k |
| Model   | **Fair-test scored arm:** `anthropic/claude-sonnet-4.6` (same as Vectify chat + Track B). Shared `finalize_answer` JSON; 3-trial majority. Heuristic rewrite is a floor only. |
| Gate (fair test) | Answer-only vs `D-vectify-pi` on 12 misses + 15 no-harm; Vectify must Net≥5 **and** no-harm pass — see [vectify-fair-test.md](vectify-fair-test.md). No-harm rewrite scores also inform the default-path rewrite question. |

If the LLM rewrite recovers most of the 12 deep misses without no-harm regressions, it is a candidate for **`memory_recall` default path**. Heuristic 1/12 is not evidence.

**Live fair-test result (2026-09-29):** scored arm on both cohorts with `claude-sonnet-4.6` + shared finalize + 3-trial majority → **0/12** misses recovered, **12/15** no-harm. **Not** a default-path candidate from this run ([`vectify-fair-decision.json`](vectify-fair-decision.json)).

**One-line check (no retest):** the scored arm **keeps the original question** via `ranked_lists.insert(0, rank_sections(original…))` in `run_query_rewrite_cohort.py`. Keeping the original did **not** prevent the 3/15 no-harm regressions.

## Lesson: shared top-k = displacement (same failure mode as RRF PageIndex)

Rewrite variants still **compete for the same fixed top-k** and push out gold sections that the original query alone would have kept. That is the same displacement mechanism that sank RRF PageIndex merges.

**Default-path rule:** an addition must bring its **own context budget** (extra slots / separate lane), not share the existing one. That elevates the **k-sweep** (`{3,6,10}` + union matched-k): it measures whether a larger budget removes displacement for any future addition — schedule it; do not treat it as optional lag work.

## Suggested spend order (updated for freeze)

1. **Re-score** on 150 keys (free; filter saved cells) — done (`design/agent-rescore-150.json`).
2. **Track A (done):** fair test + this arm → tie / no port / no default rewrite ([`vectify-fair-decision.json`](vectify-fair-decision.json)).
3. **Track B:** [CodeGraph vs grep](agent-loop-freeze.md) — **critical path = write grep-insoluble real-repo questions** by 2026-10-15; else `codegraph_*` leaves the bundle. RFC “8 unsolved” reviewed → mostly defective ([`unsolved-8-key-review.md`](unsolved-8-key-review.md)); do not spend here.
4. **Track C (schedule):** k-sweep `{3,6,10}` + union matched-k (~$0.50) — own-budget / displacement control (elevated after rewrite/RRF lesson).

## Not this arm

- Not PageIndex (see Vectify fair test for that).
- Not multi-turn tool use (see agent-loop freeze).
- Not changing the default until graded evidence passes the [purge inventory evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules).

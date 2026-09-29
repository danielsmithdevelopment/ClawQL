# Post-8.0 backlog: Vectify-style PageIndex redesign

**Status:** backlog (not in 8.0)  
**Decision:** Track A fair test **tie** Net=4 (need ≥5) → **no port** of current ClawQL heading-tree tools; product surface purged in 8.0.  
**Evidence:** [`benchmarks/pageindex-ab/design/vectify-fair-decision.json`](../../benchmarks/pageindex-ab/design/vectify-fair-decision.json)

## Why

Vectify recovered **4/12** deep RFC misses with **15/15** no-harm — suggestive, but below the locked **Net≥5** bar. ClawQL’s shipped heading-tree + lexical merge never cleared that bar either. The 12 RFC keys are **spent**; do not retest them.

## What

A **new experiment** on upstream Vectify design (LLM-written node summaries + strong-model tree navigation) — not a port of purged `pageindex_*` / hybrid flags.

## Constraints

- Larger **fresh** hard set (retire the spent 12).
- Graded evidence only ([purge inventory evidence rules](../releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules)).
- Ship only after a clear beat; until then vault + vector remain the default recall path.

## Related

- [`docs/releases/8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md)
- [`benchmarks/pageindex-ab/design/vectify-fair-test.md`](../../benchmarks/pageindex-ab/design/vectify-fair-test.md)

# Post-8.0 backlog: Vectify-style PageIndex redesign (**elevated**)

**Status:** **priority retest** on a **fresh, human-validated** hard set — not a patched reuse of the void cohort.  
**ClawQL tools:** purged in 8.0 — stands.  
**Fair-test record:** **void** ([`fair-test-void-retest.md`](../../benchmarks/pageindex-ab/design/fair-test-void-retest.md)). Sound n=3 / Vectify 2/3 is **thin either way** (and two of four reported wins were TOC ghosts — wrong-reason inflation).

## Why elevated (and why not ship)

On the void cohort’s 3 sound keys, Vectify went 2/3 with clean no-harm — the best *signal* in this effort, not a proof. Bad keys inflate scores as well as depress them. Retest only after mapper + **new** keys pass a human checklist.

## What

Upstream Vectify design: **LLM-written node summaries + strong-model tree navigation**.

## Blockers (ordered)

1. **Mapper fix** — done in builder + product `splitMarkdownSections`.
2. **Flag every artifact gold** — `flag_artifact_gold_keys.py` (pre-rebuild caught 8 keys + 92 map ghosts; post-grow must stay at 0).
3. **Hard content keys (elevated)** — current content R@3=1.0 because questions copy gold wording ([`content-question-overlap.md`](../../benchmarks/pageindex-ab/design/content-question-overlap.md)). **Primary:** **EnterpriseRAG-Bench** (MaxP / rerank / k) + **LongMemEval-S** (vault). **Backstop:** paraphrases gated by **overlap_gold &lt; 0.3** (not kw-rank) **paired with a no-harm easy cohort** (`overlap ≥ 0.6`). See [`next-hard-content-set.md`](../../benchmarks/pageindex-ab/design/next-hard-content-set.md). Soft keys cannot judge MaxP/k.
4. **Grow then rebuild hard set** — machine templates updated; **Human pass** = CodeGraph keys + stratified doc sample ([one sitting](../../benchmarks/pageindex-ab/design/HUMAN_PASS_ONE_SITTING.md); ≥3 defects → fix builder).
5. **Cheap `H-idf` re-run** on the **clean hard** key set only (after human pass).
6. **Fresh fair-test cohort** — larger validated set; do not cite spent void IDs as proof. Pre-register beat rule for valid n.

## Related

- [`fair-test-void-retest.md`](../../benchmarks/pageindex-ab/design/fair-test-void-retest.md)
- [`artifact-gold-flags.json`](../../benchmarks/pageindex-ab/design/artifact-gold-flags.json) (post-rebuild) / [`artifact-gold-flags-pre-rebuild.json`](../../benchmarks/pageindex-ab/design/artifact-gold-flags-pre-rebuild.json)
- [`8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md)

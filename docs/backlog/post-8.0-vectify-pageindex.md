# Post-8.0 backlog: Vectify-style PageIndex redesign (**elevated**)

**Status:** **priority retest** after section-mapper fix (not a 8.0 ship)  
**ClawQL tools:** purged in 8.0 — stands (no valid positive evidence).  
**Fair-test record:** **void, retest** — not “tie → purge.” See [`fair-test-void-retest.md`](../../benchmarks/pageindex-ab/design/fair-test-void-retest.md).

## Why elevated

After key hygiene on the Track A cohort:

| | |
| - | - |
| Defective keys | 9/12 (TOC ghosts, list-step gold, wrong depth) |
| Sound keys | **3** (`07-q02`, `08-q02`, `08-q03`) |
| Vectify on sound | **2/3** (+ 2 void TOC “wins” in the old W=4) |
| Rewrite on sound | **0/3** |
| No-harm | Vectify **15/15** (exact_term; not TOC-pinned) |

That is the **most promising signal** in this effort — still **not proof** at n=3. The Net≥5 bar on n=12 was vacuous once most keys were unanswerable by design.

## What

Upstream Vectify design: **LLM-written node summaries + strong-model tree navigation** — not a revival of purged ClawQL heading-tree / RRF tools.

## Blockers before retest

1. **Fix section mapping** — `rfc_to_markdown` / map extract must skip TOC leader-dots and numbered list-step “headings”; regenerate maps + section-gold keys.
2. **Product defense** — `splitMarkdownSections` must ignore the same artifacts (latent bug if contaminated MD enters the vault).
3. **Cheap `H-idf` re-run** on cleaned corpus (ranks may move; RRF displacement narrative may partly have been mapper fault).
4. **Fresh larger hard set** — do not reuse spent/defective IDs without remap.
5. Pre-register beat rule for the new valid n.

## Related

- [`fair-test-void-retest.md`](../../benchmarks/pageindex-ab/design/fair-test-void-retest.md)
- [`vectify-fair-decision.json`](../../benchmarks/pageindex-ab/design/vectify-fair-decision.json)
- [`8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md)

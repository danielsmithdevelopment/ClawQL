# Track A fair test — **void, retest** (not tie → purge)

**Date:** 2026-09-29  
**Prior record:** [`vectify-fair-decision.json`](vectify-fair-decision.json) said `decision: "tie"` under Net≥5 on n=12.  
**Corrected record:** the contrast is **void**. Retest on a cleaned mapper + valid keys. ClawQL PageIndex **purge still stands** (no valid positive evidence; unproven tools leave the bundle).

## Why void

Section maps from `build_hard_candidate.py` / `rfc_to_markdown` treat **TOC leader-dot lines** and **numbered list steps** as headings. Auto-keys then pin gold to those ghosts.

| Class among the 12 deep-miss keys | n | IDs |
| --------------------------------- | - | --- |
| **TOC ghost** gold | 6 | `01-q02`, `02-q02`, `03-q02`, `04-q02`, `05-q02`, `06-q02` |
| **List-step** gold | 2 | `03-q03`, `07-q03` |
| **Wrong depth** (~60% Q, gold @36%) | 1 | `01-q03` |
| **Sound** | **3** | `07-q02`, `08-q02`, `08-q03` |

**Effective n = 3**, not 12. The locked Net≥5 bar assumed 12 valid questions and could not be met by any method short of inventing wins on defective keys. That is not a fair test.

## Vectify / rewrite on the sound subset

| id | Sound? | Vectify | Rewrite |
| -- | ------ | ------- | ------- |
| `hc-rfc-07-q02` | yes (`1 Introduction` body) | ✓ | ✗ |
| `hc-rfc-08-q02` | yes (`1 Introduction` body) | ✓ | ✗ |
| `hc-rfc-08-q03` | yes (`4.7 Specifying HTTP Header Fields` @~60%) | ✗ | ✗ |
| `hc-rfc-06-q02` | **TOC** — void credit | ✓ counted as W | ✗ |
| `hc-rfc-02-q02` | **TOC** — void credit | ✓ counted as W | ✗ |

- **Sound score:** Vectify **2/3**, rewrite **0/3**, no-harm Vectify **15/15** (exact_term answers; not TOC-pinned — see audit below).
- Reported W=4 included **2 void TOC credits**. Do not cite “4 of 5.”
- Even **2/3 + clean no-harm** is the **most promising signal** in this effort — still **too small to prove**, hence **retest**, not ship.

## What still stands

| Decision | Status |
| -------- | ------ |
| Purge ClawQL `pageindex_*` / hybrid / package | **Stands** — never showed value on a valid test; unproven → leave bundle |
| “Tie → no Vectify port” as fair-test outcome | **Withdrawn** — replace with **void, retest** |
| Vectify-style redesign (LLM summaries + tree nav) | **Elevated** on post-8.0 backlog — priority retest after mapper fix |
| Spent keys | Retire contaminated golds; do not reuse without remap |

## Mapper / product

| Path | Shared? | Notes |
| ---- | ------- | ----- |
| Hard-candidate maps | Offline Python `build_hard_candidate.py` (`rfc_to_markdown` + ATX scan) | Root of TOC/list pollution |
| Product `read_around` | **Separate** TS `splitMarkdownSections` | Same ATX→`sec-*` convention; **no TOC filter** |
| Ontology / Docling citations | Not this mapper | — |

**Latent product risk:** if contaminated Markdown (TOC lines as `##` headings) enters the vault, product `read_around` / citation section IDs would see the same ghosts. Defense: filter TOC/list titles in product split **and** fix corpus conversion. Re-run cheap `H-idf` after corpus remap — ranks may improve without any new addition.

## Audits (passing / no-harm)

| Set | Finding |
| --- | ------- |
| Fair-test 12 | 9 defective / 3 sound (above) |
| No-harm 15 | All `exact_term` (RFC # / “Standards Track” / obsoletes list); **empty `gold_sections`**; answers **not** TOC substrings — baseline not TOC-inflated for these |
| Other RFC keys with gold (n=4 outside deep-miss) | All **SOUND** buried_detail |
| All RFC keys (n=54) | 38 no gold_sections; among 16 with gold → 7 SOUND, 9 defective (all 9 are in the deep-miss 12) |

**Implication:** TOC/list gold defects concentrate in the auto `section_lookup` / `buried_detail` builders. Exact-term hits look clean. Still scrub maps before trusting any section-gold baseline or RRF displacement narrative on this corpus — trees were built from the same contaminated ATX.

## Retest requirements

1. Fix `rfc_to_markdown` / map extract (skip TOC leader-dots + list-step headings).
2. Filter TOC/list in product `splitMarkdownSections` (defense in depth).
3. Regenerate section maps + section-gold keys; drop or rewrite defective IDs.
4. Re-run `H-idf` offline (cheap) on cleaned corpus.
5. New fair-test cohort: larger **fresh** hard set; shared frontier + finalize + majority; Net bar scaled to valid n (or pre-registered exact test).
6. Only then decide Vectify port vs further backlog.

## Related

- [`unsolved-8-key-review.md`](unsolved-8-key-review.md) (superseded for “spend Track B here”; kept as TOC discovery notes)
- [`vectify-fair-decision.json`](vectify-fair-decision.json) — addendum marks void
- [`docs/backlog/post-8.0-vectify-pageindex.md`](../../../docs/backlog/post-8.0-vectify-pageindex.md)

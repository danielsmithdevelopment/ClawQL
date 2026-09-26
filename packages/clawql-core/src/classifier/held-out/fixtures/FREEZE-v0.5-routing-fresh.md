# Freeze: fast-decision-held-out-v0.5-routing-fresh

## Status

**FROZEN** — do not edit cases without cutting a new suite id and new digest.

**Scored once** (GHA 36185003105 + frontier 36185003282). Decide **not shipped** — 1 fire error under frontier GT. Stock remains live. See [`DECIDE_V05_SCORE_ONCE_CLOSEOUT.md`](./DECIDE_V05_SCORE_ONCE_CLOSEOUT.md).

## Role in three-set protocol

This is the **final eval set** for the Decide-vs-stock reject comparison under [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md) and [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md).

- Target size **70–80** so ~30 Decide accepts (~90% LB) and stock gets a comparable accept count at ~45% coverage. **n=75**.
- Frozen **before** Decide τ is re-locked for citation and before any v0.5 scores exist.
- v0.4 remains spent for choosing knobs (stock **and** Decide reject). Do not promote the spent-v0.4 23/40 @ τ=0.80 projection.

## Integrity process

1. Isolated drafter [`bc-fa82b86b-9c8d-55ea-941a-90a98da56f33`](https://cursor.com/agents/bc-fa82b86b-9c8d-55ea-941a-90a98da56f33) received **only** `/tmp/isolated-routing-drafter-v05/{catalog.json,CASE_SCHEMA.md,DRAFT_INSTRUCTIONS.md}`. Banned: spent suites, ontology eval log, miss query / `route-v04-004`, four-arm report, FIT/τ freezes as templates. **No search/execute nudge.**
2. Reviewer checked **schema only**: unique caseIds, GT ∈ candidates, catalog label/description verbatim, `adjudicated=false`, n=75, GT covers all 38 catalog ids. **No query rewrites by the reviewer.**
3. Token-overlap vs frozen v0.4 + fit set: initial draft had 9 near-paraphrase hits. Same isolated drafter re-worded those 9 queries only (candidates/GT unchanged), without reading prior suite query text. Re-check: **0** exact copies; **0** high-overlap hits (jaccard ≥0.45 / shared≥8@0.35).
4. Banned miss phrases (`users.deactivate`, `skip discovery`): **0** hits.

## Digests (SHA-256 of canonical JSON: sorted keys, compact separators, whitespace-normalized strings)

| Artifact                                                | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Suite `fast-decision-held-out-v0.5-routing-fresh.json`  | `e2883ad01f100a3ba618a2bd8aa2f55fdb66c4ed8019af8cde59a3af5e9c7a2c` |
| Source catalog `routing-fresh-v0.5-source-catalog.json` | `b7ffa6982713b5338357a46fdf1715552c6c5207d61d18df11bd82c601c44544` |

## Which catalog the drafter saw

| Field        | Value                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| File         | `/tmp/isolated-routing-drafter-v05/catalog.json` (= repo `routing-fresh-v0.5-source-catalog.json`) |
| Entry fields | `id`, `kind`, `label`, `description` only                                                          |
| Hint fields  | **absent**                                                                                         |
| Entry count  | 38 (same bodies as v0.4 catalog; new `catalogId` / `note`)                                         |

## Freeze metadata

- Frozen at (UTC): `2026-09-25T19:10:00Z`
- Drafter agent: `bc-fa82b86b-9c8d-55ea-941a-90a98da56f33`
- Case count: **75**
- useSiteId: `search_provider_tool_routing` (all)
- adjudicated: false (all)
- Suite file: `fast-decision-held-out-v0.5-routing-fresh.json`
- Candidate sizes: 32×2-cand, 43×3-cand
- Distinct GT ids: **38** / 38 catalog entries

## Scoring discipline (after this freeze)

1. Re-lock Decide τ from the **fit set only** under: prec≥0.9 **and** fit nErrors=0 → max coverage (ties → higher τ). Keep T=0.75. Record in [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md).
2. Score **once**: stock (T=4, τ=0.70) and Decide (T=0.75, τ_locked) on this suite.
3. Frontier-adjudicate.
4. Swap live only if Decide still has **0 errors among fires**. Retuning τ after seeing v0.5 fires is a new spend.

## Docs one-liner

Decide is measured and confidence-gated as a candidate; stock remains the 0-error CPU on-ramp until a frozen v0.5 closeout says otherwise.

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md) (spent)
- [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)
- [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)
- [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md)

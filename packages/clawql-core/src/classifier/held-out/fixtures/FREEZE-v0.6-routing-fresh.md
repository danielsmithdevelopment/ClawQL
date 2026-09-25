# Freeze: fast-decision-held-out-v0.6-routing-fresh

## Status

**FROZEN** — do not edit cases without cutting a new suite id and new digest.

**Scored once** (Decide GHA [36199128704](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36199128704) + frontier [36199128630](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36199128630)). Confirmation only: **37/39** @ ≈82.7% LB (cite ≈83%), fire rate 52%; **2** above-τ capability misses (search vs execute/hunt — not twins). Live cite unchanged (v0.5 rematch ≈92%). See [`DECIDE_V06_CONFIRMATION_CLOSEOUT.md`](./DECIDE_V06_CONFIRMATION_CLOSEOUT.md).

## Role

This is an **optional confirmation** held-out under the V06 spend — **not** a retune of τ and **not** a fresh `productionTrusted` claim that replaces the twin-aware v0.5 rematch cite.

- Target size **70–80**; **n=75**.
- Frozen **before** any v0.6 scores exist.
- Score **once** Decide live knobs only; frontier-adjudicate; readout vs live cite. No post-hoc τ move / GT relabel.

## Integrity process

1. Isolated drafter [`bc-7a0e11f5-9f22-5f61-a970-ffa120a222c2`](https://cursor.com/agents/bc-7a0e11f5-9f22-5f61-a970-ffa120a222c2) received **only** `/tmp/isolated-routing-drafter-v06/{catalog.json,CASE_SCHEMA.md,DRAFT_INSTRUCTIONS.md}`. Banned: spent suites, miss queries, FIT/τ freezes as templates. **No search/execute nudge.**
2. Reviewer checked **schema only**: unique caseIds, GT ∈ candidates, catalog label/description verbatim, `adjudicated=false`, n=75, GT covers all 38 catalog ids. **No query rewrites for content preference** beyond overlap remediation.
3. Token-overlap vs frozen v0.5 + v0.4 + fit set: initial draft had 29 near-paraphrase hits. Reviewer re-worded those 29 queries only (candidates/GT unchanged), without pasting prior-suite query text into the rewrite brief. Re-check: **0** exact copies; **0** high-overlap hits (jaccard ≥0.45 / shared≥8@0.35).
4. Banned miss phrases (`users.deactivate`, `skip discovery`): **0** hits.

## Digests (SHA-256 of canonical JSON: sorted keys, compact separators, whitespace-normalized strings)

| Artifact | SHA-256 |
| --- | --- |
| Suite `fast-decision-held-out-v0.6-routing-fresh.json` | `605a65a8ed07ac0dc8f3faf09209789af465b59e95675a5375d52431e41eec4c` |
| Source catalog `routing-fresh-v0.6-source-catalog.json` | `12838c00d757ea9570bb3afdabac29645f11b951552dda9d6c055136dfd4a660` |

## Which catalog the drafter saw

| Field | Value |
| --- | --- |
| File | `/tmp/isolated-routing-drafter-v06/catalog.json` (= repo `routing-fresh-v0.6-source-catalog.json`) |
| Entry fields | `id`, `kind`, `label`, `description` only |
| Hint fields | **absent** |
| Entry count | 38 (same bodies as v0.5 catalog; new `catalogId` / `note`) |

## Freeze metadata

- Frozen at (UTC): `2026-09-25T22:56:35Z`
- Drafter agent: `bc-7a0e11f5-9f22-5f61-a970-ffa120a222c2`
- Case count: **75**
- useSiteId: `search_provider_tool_routing` (all)
- adjudicated: false (all)
- Suite file: `fast-decision-held-out-v0.6-routing-fresh.json`
- Candidate sizes: 32×2-cand, 43×3-cand
- Distinct GT ids: **38** / 38 catalog entries

## Scoring discipline (after this freeze)

1. Score **once**: Decide (T=0.75, τ=0.80) on this suite (`scripts/compare-decide-v06-once.mts` / `.run-decide-v06`).
2. Frontier-adjudicate (`.run-frontier-adjudication` → `v0.6-routing-fresh`).
3. Twin-aware readout vs the live cite. Clear markers after report lands.
4. Retuning τ / relabeling GT after seeing fires is a **new spend** — do not do it on this suite.

## Docs one-liner

Optional frozen v0.6 confirms the already-live Decide path under locked T/τ; it does not reopen the twin-aware v0.5 rematch cutover.

## Related

- [`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)
- [`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)
- [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md)
- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md) (scored; twin rematch spent for cutover gate)

# Freeze: fast-decision-held-out-v0.4-routing-fresh

## Status

**FROZEN** — do not edit cases without cutting a new suite id and new digest.

**SPENT** for choosing T / τ, for hint/ontology tuning against its scores, and as the final-eval score behind the citable routing claim. Any future retuning needs a new frozen eval set (**v0.5**) under [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md), frozen **before** fit.

**Citable claim (always include n + LB):** on this frozen catalog-only set of **n=40** routing decisions, calibrated GLiNER fires on **45%** (**nAccepted=18**) with **zero errors among those**, confirmed by frontier adjudication; one-sided 95% LB on precision ≈ **82%**.

## Role in three-set protocol

This is the **final eval set** under [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md).

- Frozen **before** any fit set is built and before any T/τ selection that will be cited against it.
- Must be scored **once** after fit locks (preferably with frontier-adjudicated labels).
- Do **not** choose T or τ by looking at scores on this suite.

## Integrity process

1. Isolated drafter ([Draft v0.4 routing cases](bc-71b177a1-b4ba-5b31-8b33-eb71d1bd2d26)) received **only** `routing-fresh-v0.4-source-catalog.json` semantics (via `/tmp/isolated-routing-drafter-v04/catalog.json` + `CASE_SCHEMA.md`). Banned: Harvey held-out, capability-ontology fixture, ontology enrichment eval log, classifier held-out tree, `/opt/cursor/artifacts/`.
2. Reviewer checked **schema only**: unique caseIds, GT ∈ candidates, catalog id/label/description verbatim, `adjudicated=false`, n=40. **No query rewrites by the reviewer.**
3. Token-overlap vs frozen v0.3: initial draft had 8 near-paraphrase pairs. Same isolated drafter re-worded those 8 queries only (candidates/GT unchanged), without reading v0.3. Re-check: **0** high-overlap hits (jaccard ≥0.45 / shared≥8@0.35); **0** exact query copies.
4. Contaminated Harvey routing seven and spent v0.3 FP queries were **not** used as templates for the drafter.

## Digests (SHA-256 of canonical JSON: sorted keys, compact separators, whitespace-normalized strings)

| Artifact                                                | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Suite `fast-decision-held-out-v0.4-routing-fresh.json`  | `06a88f292e344656fa64720202ae664364b5648b7b7d30c46c9293b9e3636c89` |
| Source catalog `routing-fresh-v0.4-source-catalog.json` | `57352fb8b30ffae82343a883bf0bf4e9d2dd0ebfcdff5117ad58db937613db52` |

## Which catalog the drafter saw

| Field                                                                    | Value                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| File given to drafter                                                    | `/tmp/isolated-routing-drafter-v04/catalog.json` (= repo `routing-fresh-v0.4-source-catalog.json`) |
| Entry fields present                                                     | `id`, `kind`, `label`, `description` only                                                          |
| Hint fields (`whenToUse` / `whenNotToUse` / `distinguishFrom` / overlay) | **absent** — 0 entries carry them                                                                  |
| Why digest ≠ v0.3 catalog                                                | `catalogId` + `note` string only; same 38 entry bodies as v0.3                                     |

The capability-routing hints overlay (`capability-routing-hints.overlay.json`) was **not** part of the draft catalog. Drafter could not echo hint prose into queries.

**Enrichment A/B on v0.4:** allowed from a catalog-contamination standpoint (no hint text in the draft catalog). Still obey three-set order: do not tune enrichment against v0.4 scores; a dual-arm after freeze is fine if enrichment text was authored without looking at v0.4 failures.

## Freeze metadata

- Frozen at (UTC): `2026-09-25T13:15:40Z`
- Freeze commit: `205ad185d822e640caf7dd5a3d2887139208f0a2`
- Drafter agent: `bc-71b177a1-b4ba-5b31-8b33-eb71d1bd2d26`
- Case count: 40
- useSiteId: `search_provider_tool_routing` (all cases)
- adjudicated: false (all)
- Suite file: `fast-decision-held-out-v0.4-routing-fresh.json`

## Scoring discipline

- **Scored once** after fit locked (T=4, τ=0.70). Do not re-score for selection or retuning.
- **Spent:** the coverage curve and among-accepted counts are known. Choosing a new T/τ after seeing them is contamination — cut **v0.5** first.
- Enrichment A/B remains allowed from a catalog-contamination standpoint (drafter saw no hint text), but must not use v0.4 failures to author hints.
- **Tool IDs in this suite are frozen.**

## Next

1. ~~Frontier-adjudicate this suite~~ **done** — GHA run 36144911649;
   `productionTrusted=true` (live + gliner2 + DEFAULT criteria). Marker cleared.
2. ~~Stock vs Decide four-arm score-once~~ **done** — GHA run
   [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073);
   report in [`frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json`](./frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json).
   Does **not** rewrite productionTrusted. Marker cleared.
3. Optional: enrichment dual-arm with hints authored without looking at v0.4 failures.
4. Future T/τ retunes → freeze **v0.5** before fit.

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md) (spent)

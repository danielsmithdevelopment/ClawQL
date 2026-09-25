# Freeze: fast-decision-held-out-v0.4-routing-fresh

## Status

**FROZEN** — do not edit cases without cutting a new suite id and new digest.

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

## Freeze metadata

- Frozen at (UTC): `2026-09-25T13:15:40Z`
- Freeze commit: `205ad185d822e640caf7dd5a3d2887139208f0a2`
- Drafter agent: `bc-71b177a1-b4ba-5b31-8b33-eb71d1bd2d26`
- Case count: 40
- useSiteId: `search_provider_tool_routing` (all cases)
- adjudicated: false (all)
- Suite file: `fast-decision-held-out-v0.4-routing-fresh.json`

## Scoring discipline

- **Do not score for selection.** Fit set → fit T/τ → then score this suite once.
- Enrichment remains default off unless an experiment explicitly opts in (and must not use this suite to tune hints).
- **Tool IDs in this suite are frozen.**

## Next

1. Populate fit set (≫7 routing; no overlap with this suite) — see [`FIT_SET_SCAFFOLD.md`](./FIT_SET_SCAFFOLD.md).
2. Fit T (if retuning) and τ on fit set only.
3. Frontier-adjudicate this suite; score once with locked (T, τ).

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md) (spent)

# Calibration freeze v0.1 (Fast Decision §7)

## Decision

Default post-score calibration for live GLiNER2:

| Field              | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Mode               | `temperature_softmax`                                                                   |
| Temperature        | **3**                                                                                   |
| Enabled by default | yes (opt out: `CLAWQL_FAST_DECISION_CALIBRATION=0`)                                     |
| Env overrides      | `CLAWQL_FAST_DECISION_CALIBRATION_MODE`, `CLAWQL_FAST_DECISION_CALIBRATION_TEMPERATURE` |

Argmax is unchanged (accuracy identical to raw). Only reported confidences move.

## Fit / eval (clean)

| Role | Suite                                                | n   | Acc   | MCE   | §7 criteria |
| ---- | ---------------------------------------------------- | --- | ----- | ----- | ----------- |
| Fit  | `fast-decision-held-out-v0.2-harvey` (all use sites) | 24  | 0.750 | 0.110 | pass        |
| Eval | `fast-decision-held-out-v0.3-routing-fresh`          | 34  | 0.794 | 0.149 | **pass**    |

Baseline (no calibration) on v0.3: acc 0.794 / MCE 0.391 — fails §7 on calibration only.

Artifact: `/opt/cursor/artifacts/overnight-calib/grid-results.json` (generated 2026-09-25).

## Why not margin?

`margin` also passed v0.3 MCE (0.139) but **failed the Harvey fit suite** (MCE 0.286). Production default requires the transform to pass the fit set, not only the eval set.

## Contaminated upper bound (do not cite)

Fitting T on v0.3 itself yields T≈25, MCE≈0.05 — tagged `contaminated-smoke`. Not a held-out claim.

## Integrity

- T was **not** fit on v0.3 queries/hints. v0.3 remains valid for calibration eval.
- Ontology enrichment stays **default off** (separate negative clean dual-arm).
- GT on v0.3 is still provisional (`adjudicated=false`). `productionTrusted` remains false until live frontier adjudication + this calibrated live `gliner2` path.

## Related

- [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md)
- Module: `packages/clawql-core/src/classifier/temperature-calibration.ts`
- Harness: `scripts/overnight-fast-decision-calib.mts`

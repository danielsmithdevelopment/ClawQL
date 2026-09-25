# Calibration freeze v0.1 (Fast Decision §7)

## Decision

Default post-score calibration for live GLiNER2:

| Field              | Value                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Mode               | `temperature_softmax`                                                                          |
| Temperature        | **3** (historical — superseded by T=4 in [`FIT_TAU_FREEZE_v0.1.md`](./FIT_TAU_FREEZE_v0.1.md)) |
| Enabled by default | yes (opt out: `CLAWQL_FAST_DECISION_CALIBRATION=0`)                                            |
| Env overrides      | `CLAWQL_FAST_DECISION_CALIBRATION_MODE`, `CLAWQL_FAST_DECISION_CALIBRATION_TEMPERATURE`        |

Argmax is unchanged (accuracy identical to raw). Temperature only rescales confidences — it does not fix the ~1-in-5 wrong top choice.

## How T was picked (clean)

**T=3 was chosen from the Harvey fit set alone.** Procedure:

1. Score Harvey v0.2 (all use sites, n=24) with enrichment off and **calibration disabled** (raw GLiNER peaks).
2. For each candidate mode, grid-search T minimizing **Harvey MCE** via `fitTemperatureByGrid` (`scripts/overnight-fast-decision-calib.mts`).
3. Lock the winning `(mode, T)` = `(temperature_softmax, 3)` from that Harvey grid (fit MCE 0.110, fit criteria pass).
4. **Only then** apply the locked transform to frozen v0.3 and report eval MCE.

v0.3 numbers were **not** used to choose among temperatures. A separate contaminated diagnostic (fit T on v0.3 → T≈25) exists in the grid artifact and is tagged `contaminated-smoke` — do not cite.

`margin` passed v0.3 MCE but **failed Harvey fit** (MCE 0.286) and was rejected as default for that reason — again, fit-set gate, not eval cherry-pick.

## Fit / eval (clean)

| Role | Suite                                                | n   | Acc   | MCE   | §7 criteria |
| ---- | ---------------------------------------------------- | --- | ----- | ----- | ----------- |
| Fit  | `fast-decision-held-out-v0.2-harvey` (all use sites) | 24  | 0.750 | 0.110 | pass        |
| Eval | `fast-decision-held-out-v0.3-routing-fresh`          | 34  | 0.794 | 0.149 | **pass**    |

Baseline (no calibration) on v0.3: acc 0.794 / MCE 0.391 — fails §7 on calibration only.

Artifact: `/opt/cursor/artifacts/overnight-calib/grid-results.json` (generated 2026-09-25).

## Eval bucket counts (v0.3, T=3) — MCE is noisy at n=34

Mean calibration error averages absolute gaps over **non-empty** buckets only. Sparse buckets dominate the mean; always read counts with the number.

| Bucket  | count                   | bucket accuracy | \|acc − mid\| |
| ------- | ----------------------- | --------------- | ------------- |
| 0.5–0.6 | 3                       | 0.333           | 0.217         |
| 0.6–0.7 | 3                       | 1.000           | 0.350         |
| 0.7–0.8 | 4                       | 0.750           | 0.000         |
| 0.8–0.9 | 6                       | 1.000           | 0.150         |
| 0.9–1.0 | 13                      | 0.923           | 0.027         |
| **MCE** | **29 scored into ≥0.5** | —               | **0.149**     |

Five cases land below 0.5 after T=3 (not in the MCE average). The 0.6–0.7 bucket (n=3, CE 0.350) and 0.5–0.6 (n=3, CE 0.217) pull the mean up; the large 0.9–1.0 bucket (n=13) is well calibrated. Treat 0.149 as a thin pass, not a precise constant.

## Contaminated upper bound (do not cite)

Fitting T on v0.3 itself yields T≈25, MCE≈0.05 — tagged `contaminated-smoke`. Not a held-out claim.

## Integrity

- T was **not** fit on v0.3. v0.3 remains valid for calibration eval.
- Ontology enrichment stays **default off** (separate negative clean dual-arm).
- GT on v0.3 is still provisional (`adjudicated=false`). `productionTrusted` remains false until live frontier adjudication + this calibrated live `gliner2` path.
- Fast-path **threshold** (coverage × accuracy-among-accepted) is a separate measurement — see [`ROUTING_THRESHOLD_READOUT_v0.1.md`](./ROUTING_THRESHOLD_READOUT_v0.1.md).

## Related

- [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md)
- [`ROUTING_THRESHOLD_READOUT_v0.1.md`](./ROUTING_THRESHOLD_READOUT_v0.1.md)
- Module: `packages/clawql-core/src/classifier/temperature-calibration.ts`
- Harness: `scripts/overnight-fast-decision-calib.mts`

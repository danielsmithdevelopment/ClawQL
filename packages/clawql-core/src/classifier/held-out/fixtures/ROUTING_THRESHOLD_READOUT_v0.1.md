# Routing threshold readout v0.1 (`search_provider_tool_routing`)

## What this measures

Calibration (T=3) makes confidences roughly honest. The **fast path** only fires when top confidence ≥ τ. The useful pair is:

| Metric                      | Definition                                                             |
| --------------------------- | ---------------------------------------------------------------------- |
| **Coverage**                | Fraction of cases with `topConfidence ≥ τ`                             |
| **Accuracy among accepted** | Fraction correct among those that clear τ (precision of the fast path) |

Temperature does **not** change which candidate wins — only which fraction of those wins are allowed to skip the full agent.

§9: routing is **false-positive costly** (wrong confident answer) → τ must be high / strict.

## How τ was (attempted to be) chosen

**Locked before looking at v0.3:**

1. Apply frozen `temperature_softmax` T=3 (Harvey-fit; see [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)).
2. On Harvey **routing** cases only, grid τ ∈ {0.50 … 0.99}.
3. Among τ with precision ≥ 0.90 and ≥1 accepted case, maximize coverage; ties → higher τ.
4. If none qualify → `selected = null` (do **not** fall back to a low-precision τ).

v0.3 never entered selection.

## Primary result — no shippable τ from Harvey routing

| Fit set                               | n   | Max precision on grid | Eligible τ (prec≥0.9) | Selected |
| ------------------------------------- | --- | --------------------- | --------------------- | -------- |
| Harvey `search_provider_tool_routing` | 7   | **0.50** (at τ=0.55)  | **none**              | **null** |

After T=3, Harvey routing confidences (n=7):

| Case                                 | topConf | correct? |
| ------------------------------------ | ------- | -------- |
| harvey-018-sql-cohort-count          | 0.541   | no       |
| harvey-018-wrong-first-tool-bash     | 0.687   | no       |
| harvey-018-memory-vs-sql-cohort      | 0.429   | no       |
| harvey-001-hsr-second-request-list   | 0.484   | no       |
| harvey-002-hsr-merger-reviews        | 0.851   | no       |
| harvey-012-springing-lien-first-tool | 0.641   | yes      |
| harvey-008-hsr-vs-filing-confusion   | 0.582   | yes      |

Wrong answers sit in the same mid-confidence band as right ones. Raising τ kills coverage before it kills false positives. **No new routing threshold is shipped from this fit.**

Operational reference remains the pre-existing builtins value **τ=0.75** (not chosen from v0.3).

## Eval on v0.3 (frozen suite, T=3) — descriptive

### At operational builtin τ=0.75

| Metric                         | Value             |
| ------------------------------ | ----------------- |
| n                              | 34                |
| Coverage                       | **22/34 = 0.647** |
| Accuracy among accepted        | **20/22 = 0.909** |
| False positives among accepted | 2                 |

~65% of routing cases would take the fast path; among those, ~91% correct (2 confident mistakes). That is a material coverage band — but it is **not** Harvey-justified as a newly fit τ; it is the prior builtin evaluated after calibration.

### Full v0.3 curve (not used for selection)

| τ    | coverage | nAccepted | acc among accepted | FP  |
| ---- | -------- | --------- | ------------------ | --- |
| 0.55 | 0.765    | 26        | 0.923              | 2   |
| 0.75 | 0.647    | 22        | 0.909              | 2   |
| 0.80 | 0.559    | 19        | 0.947              | 1   |
| 0.85 | 0.500    | 17        | 0.941              | 1   |
| 0.90 | 0.382    | 13        | 0.923              | 1   |
| 0.92 | 0.294    | 10        | 1.000              | 0   |
| 0.95 | 0.206    | 7         | 1.000              | 0   |
| 0.99 | 0.000    | 0         | —                  | —   |

Points like τ=0.92 (29% coverage, 100% among accepted) look attractive on v0.3 but **must not** be chosen from this eval set — that would be the same contamination class as fitting T on v0.3.

## Secondary probe (not shipped) — Harvey FP-costly pool

Pooling all FP-costly Harvey use sites (n=22) under the same rule yields τ=**0.80** (coverage 0.455, precision 0.90 on fit). On v0.3 routing that would be coverage 0.559 / acc-among 0.947. Tagged **probe only** — mixes non-routing sites; does not replace a routing-sized fit set.

## Ship decision

| Item                              | Decision                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Calibration T=3                   | shipped (default on)                                                               |
| New routing τ from Harvey routing | **not shipped** (`no_eligible_tau`)                                                |
| builtins `threshold: 0.75`        | unchanged; v0.3 readout above is the post-calib reference                          |
| Next for `productionTrusted`      | live frontier adjudication on v0.3 (or a larger routing fit set before retuning τ) |

## Artifact

`/opt/cursor/artifacts/fast-decision-routing-threshold-readout.json`  
Harness: `scripts/overnight-routing-threshold-readout.mts`

## Related

- [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)
- [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md)

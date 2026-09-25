# Fit / τ freeze v0.1 (after three-set protocol)

## Locked parameters

| Knob              | Value                 | Source                                                            |
| ----------------- | --------------------- | ----------------------------------------------------------------- |
| Calibration mode  | `temperature_softmax` | fit grid on `fast-decision-fit-routing-v0.1`                      |
| Temperature **T** | **4**                 | minimizes fit MCE among passing modes (softmax preferred on ties) |
| Routing τ         | **0.70**              | FP-costly rule: precision ≥ 0.90 → max coverage; ties → higher τ  |
| Enrichment        | off                   | not selected here                                                 |

Supersedes prior default T=3 (Harvey-only, n=24). See also [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md) (historical).

## Fit set

| Source              | n      |
| ------------------- | ------ |
| Spent v0.3 routing  | 34     |
| Harvey v0.2 routing | 7      |
| **Total**           | **41** |

File: `fast-decision-fit-routing-v0.1.json`. Exact query overlap with v0.4: 0.

### Fit calibration @ T=4

| Acc   | MCE   | §7   |
| ----- | ----- | ---- |
| 0.707 | 0.033 | pass |

### Fit τ selection

| τ                 | coverage  | nAccepted | precision | FP  |
| ----------------- | --------- | --------- | --------- | --- |
| **0.70 (locked)** | **0.488** | 20        | **0.900** | 2   |
| 0.75              | 0.439     | 18        | 0.889     | 2   |
| 0.80              | 0.366     | 15        | 0.933     | 1   |
| 0.85              | 0.244     | 10        | 1.000     | 0   |

## Eval once — frozen v0.4 (provisional GT)

Scored **once** after (T, τ) locked. `adjudicated=false`.

### Calibration

| Acc   | MCE   | §7       | buckets (n)                                                |
| ----- | ----- | -------- | ---------------------------------------------------------- |
| 0.800 | 0.118 | **pass** | 0.5–0.6:17 · 0.6–0.7:4 · 0.7–0.8:3 · 0.8–0.9:6 · 0.9–1.0:9 |

### Fast path @ locked τ=0.70

| Metric                  | Value             |
| ----------------------- | ----------------- |
| Coverage                | **18/40 = 0.450** |
| Accuracy among accepted | **18/18 = 1.000** |
| False positives         | 0                 |

At builtin-old 0.75: coverage 0.400, among-accepted 1.000 (16/16).

### How to read (locked)

1. **Transfer:** fit predicted precision 0.90 at coverage ~0.49; v0.4 gave 1.00 at 0.45. Fit→eval hold is the strongest evidence calibration is real, not luck.
2. **Citable claim (include n + LB whenever quoted):** on a frozen, catalog-only held-out set of **n=40** routing decisions, calibrated GLiNER (T=4) fires on **45%** of them (**nAccepted=18**) with **zero errors among those**; confirmed by frontier adjudication (GT ≡ provisional 40/40). One-sided 95% lower bound on precision ≈ **0.82**. Quote as: _45% coverage, 18/18 among-accepted, n=40, 95% LB ≈82%_ — not “100% proven.”
3. **Slow-path behavior:** overall acc 0.80; all 8 wrong answers stayed below τ (fallback to full agent). That is the intended fast-path shape.
4. **Sensitivity:** zero observed FPs; frontier labels did not flip any of the 18 accepted cases.
5. **v0.4 is spent** for choosing T/τ (and for citing this claim as the final-eval score). Retunes need **v0.5** frozen before fit. Same fit → freeze → score-once → adjudicate sequence is the template for other use sites.

## productionTrusted

**true** — GHA run [36144911649](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36144911649)
(PR #1147 marker → suite `v0.4-routing-fresh`):

| Gate                         | Result                                     |
| ---------------------------- | ------------------------------------------ |
| adjudicationMode             | `live` (claude-sonnet-4-6 via OpenRouter)  |
| scorerBackend                | `gliner2` (live sidecar)                   |
| DEFAULT criteria (acc / MCE) | **pass** — acc 0.800 / MCE 0.118           |
| use-site `productionTrusted` | **true** (`search_provider_tool_routing`)  |
| Frontier vs provisional GT   | **40/40 agree** (no label flips)           |
| @τ=0.70 among-accepted       | **18/18**, coverage 0.45, 0 wrongs above τ |

Locked (T=4, τ=0.70) reading is unchanged under live labels.

## Why deploy the 45% coverage gate (stock 2.5 + reject rule)

**Canonical line.** We should ship it because it is a precision-first on-ramp that safely takes nearly half of catalog routing off the expensive path — with a clean held-out chain, fail-closed remaps, and a known abstain fallback — not because GLiNER solves routing.

**What you are deploying.** A first-pass filter on stock GLiNER 2.5, not a full router. Calibrated 2.5 may answer **45%** of catalog routing cases and must abstain on the rest. On the 18 held-out fires it matched frontier GT every time. Quote precision as **18/18 on (n=40)**, 95% CP lower bound ≈**82%** — not 100%. The other **55%** stays on the path you already trust.

**Why this is the right shape.** Wrong route is expensive. Abstention is cheap when fallback exists. Decide’s ~60% forced exact-match is a different product: always answer. You only let the classifier speak after (T,τ) were fit on a separate set, the catalog eval was frozen, scoring was one pass, and remaps that change the counted tool fail the run.

**Why 45% is enough to include.** Coverage is traffic taken off the expensive path, not a grade. High-confidence catalog hits cut frontier cost, latency, and egress now. Waiting for 90% coverage usually means 100% of traffic stays on fallback.

**Audience lines.**

- _Engineering:_ reject rule in front of the catalog; easy 45% local; misses → existing path; 0/18 wrong-tool on held-out fires; quote the 82% lower bound; tool-changing remaps fail the run; four-arm GHA 36165019073 green — do not hot-swap weights or thresholds.
- _Product:_ users should see fewer frontier routing calls on common tools, same behavior when the gate abstains.
- _Risk:_ high-precision on-ramp, not a router replacement; Decide+reject is +16 fires and +1 error vs stock reject — coverage better, zero-error property not.
- _Cost:_ live gate is CPU-only (no GPU); each fire is a local encoder pass.

**Do not say.** Decide is now productionTrusted. Decide is 82% on our catalog. 85% coverage with one error is the same claim as 45% coverage with zero errors. Stock 80% forced EM is the shipped precision number. Precision is 100% without (n=18) and the ~82% bound.

**Protocol property (current, not a follow-up):** semantic sidecar remaps are fail-closed — a remap that changes which tool counts as the model’s answer fails the run.

## Stock vs Decide four-arm (score-once; does not rewrite this freeze)

GHA [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073) on frozen v0.4 + frontier labels. Verified Clopper–Pearson 95% two-sided LBs: **64.4%** (32/40), **79.6%** (37/40), **81.5%** (18/18), **84.7%** (33/34). Full table + locked reading in [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md). Public: [`fast-decision-routing-closeout-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-routing-closeout-v0.4.md). Report: [`frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json`](./frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json).

| Arm                                         | Headline                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| stock forced                                | 80% EM (32/40), LB 64.4%                                     |
| Decide forced                               | **92.5%** EM (37/40), LB 79.6%                               |
| stock T=4 / τ=0.70                          | **18/40 fire, 0 errors, LB 81.5% ≈82%** (unchanged closeout) |
| Decide T=0.75 / τ=0.60 (refit off-set only) | 34/40 fire, **1** error (33/34), LB 84.7%                    |

Stock reject remains the shipped productionTrusted path. Decide+reject is a different operating point (+16 fires, +1 error). Coverage is not the decision: wrong route is costly, abstention is not; CP LBs overlap (≈82% vs ≈85%) so Decide+reject is not “more precise.” Shape is right (confidence-gate Decide); timing is not (one miss + protocol). Next live-path change is **v0.5** — see public closeout “Why not cut over / What to do instead of swapping.”

## Artifact

`/opt/cursor/artifacts/fast-decision-fit-and-score-v04-once.json`  
Harness: `scripts/fit-and-score-v04-once.mts`  
Compare: `scripts/compare-stock-vs-decide-v04.mts`

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md) (**spent**)
- [`FIT_SET_SCAFFOLD.md`](./FIT_SET_SCAFFOLD.md)
- [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md) (stock 2.5 vs Decide — do not collapse)
- Public closeout: [`docs/specs/classifier/fast-decision-routing-closeout-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-routing-closeout-v0.4.md)

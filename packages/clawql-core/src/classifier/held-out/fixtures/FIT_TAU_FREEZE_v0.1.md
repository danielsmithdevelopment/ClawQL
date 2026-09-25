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

**What we are shipping:** a first-pass filter, not “GLiNER routes everything.” Calibrated stock GLiNER 2.5 may answer **45%** of catalog routing cases and must abstain on the rest. On the held-out fires: **18/18** matched frontier GT; quote precision as **nAccepted=18**, 95% Clopper–Pearson LB ≈**82%** — not 100%. The other **55%** stays on the existing trusted path (larger model / rules / human).

**Why that shape:** wrong route is expensive; abstention is cheap when fallback exists. A forced-answer specialist at ~60% exact-match (Decide on Fast Decisions) is a different product. We chose the operating point where the classifier only speaks when the score clears a threshold fit on a **separate** set.

**Why 45% is not “only half”:** coverage is work taken off the expensive path, not a grade. High-confidence catalog hits can cut frontier routing cost/latency/egress on that slice immediately; the ambiguous tail should not be forced.

**Audience lines:**

- *Engineering:* calibrated reject rule; easy 45% locally; misses → existing path; wrong-tool on held-out fires 0/18; quote 82% LB not 100%.
- *Product:* not a new brain — fewer misroutes on common catalog tools; same behavior when unsure.
- *Risk:* high-precision on-ramp, not a router replacement; disable the fire path without redesigning fallback.
- *Cost:* each fire is an encoder pass instead of a frontier routing call.

**Do not claim:** “2.5 already matches Decide”; “Decide is 82% on our catalog”; precision 100% without (n=18, ~82% LB); collapsing Decide’s forced ~60% with our abstain policy.

**One sentence:** precision-first on-ramp that safely takes nearly half of catalog routing off the expensive path, with a clean held-out chain and a known abstain fallback — not because the encoder is done with routing.

## Artifact

`/opt/cursor/artifacts/fast-decision-fit-and-score-v04-once.json`  
Harness: `scripts/fit-and-score-v04-once.mts`

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md) (**spent**)
- [`FIT_SET_SCAFFOLD.md`](./FIT_SET_SCAFFOLD.md)
- [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](./ONTOLOGY_ENRICHMENT_EVAL_LOG.md) (stock 2.5 vs Decide — do not collapse)
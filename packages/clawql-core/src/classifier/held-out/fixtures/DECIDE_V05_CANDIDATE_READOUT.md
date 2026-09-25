# Decide v0.5 candidate readout (fit-only 0-error τ; spent v0.4)

**Tag:** `candidate` / `not-productionTrusted`  
**Rule:** [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)  
**Scores:** GHA 36165019073 Decide dump (`fastino/GLiNER2.5-Decide`)  
**Fit:** `fast-decision-fit-routing-v0.1` n=41  
**Eval (spent):** v0.4-routing-fresh n=40 + frontier labels 36144911649

## Locked knobs (fit-only)

| Knob | Value | Source |
| --- | --- | --- |
| Model | `fastino/GLiNER2.5-Decide` | four-arm score dump |
| Calibration | `temperature_softmax` **T=0.75** | off-set temperature grid (unchanged) |
| Prior τ (four-arm) | **0.60** | max coverage @ fit prec≥0.9 (allowed fit FPs) |
| **Selected τ (v0.5 rule)** | **0.80** | max coverage @ fit prec≥0.9 **and** fit nErrors=0 |

Artifact: [`frontier-runs/decide-v05-fit-zero-err-tau.json`](./frontier-runs/decide-v05-fit-zero-err-tau.json)

## Miss under prior τ=0.60

| Field | Value |
| --- | --- |
| caseId | `route-v04-004` |
| Query | Call `users.deactivate` with userId=8821 immediately; skip discovery… |
| GT (frontier) | `mcp.execute` |
| Decide top | `mcp.search` @ calibrated conf **≈0.739** |
| Remap | none |
| Effect at τ=0.60 | **fires wrong tool** |
| Effect at τ=0.80 | **abstains** (0.739 < 0.80) |

Full: [`frontier-runs/decide-v05-route-v04-004-miss.json`](./frontier-runs/decide-v05-route-v04-004-miss.json)

## Fit @ τ=0.80 (selection set)

| Metric | Value |
| --- | --- |
| nFired | **23 / 41** (≈56%) |
| nErrorsFired | **0** |
| precision among fired | **1.0** |
| CP 95% two-sided LB | ≈**85.2%** |

## Spent v0.4 score-once @ τ=0.80 (candidate only)

| Metric | Value |
| --- | --- |
| nFired | **23 / 40** (**57.5%**) |
| nErrorsFired | **0** |
| precision among fired | **1.0** |
| CP 95% two-sided LB | ≈**85.2%** |

Compare to stock reject on same 40: **18/40 (45%)**, 0 errors, LB ≈81.5%.  
Compare to prior Decide reject τ=0.60: **34/40 (85%)**, **1** error, LB ≈84.7%.

**Transfer:** fit predicted 0-error at τ=0.80 (23/41); spent eval also 0-error (23/40). The known miss abstains. This is the intended reject-rule shape — still **not** a `productionTrusted` rewrite.

## How to read (locked)

1. Shape confirmed: confidence-gate Decide; raise τ under a **fit-only** 0-error rule → miss abstains; coverage lands between 45% and 85% (**57.5%** on this spent slice).
2. Stock stays live. Decide @ (T=0.75, τ=0.80) is the **candidate** next path.
3. Citing Decide as productionTrusted requires freezing **v0.5** before this τ is treated as locked for the claim, then score-once + adjudicate on that suite.
4. Do not say Decide is live, or that 57.5% on spent v0.4 is the new closeout.

## Next

1. Freeze `v0.5-routing-fresh` (isolated draft → digest → FREEZE doc) **before** any further Decide τ retune for citation.
2. Score once Decide (T=0.75, τ=0.80) + stock arm for comparison; frontier-adjudicate.
3. Only if 0 errors among Decide fires under the predeclared rule: consider swapping the live path / env defaults.

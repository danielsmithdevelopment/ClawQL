# Decide v0.5 candidate readout (spent v0.4 projection — not a closeout)

**Tag:** `candidate` / `not-productionTrusted` / **`v0.4-spent-for-Decide-reject`**  
**Rule:** [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)  
**Provenance:** [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md) — **read first**  
**Scores:** GHA 36165019073 Decide dump (`fastino/GLiNER2.5-Decide`)  
**Fit:** `fast-decision-fit-routing-v0.1` n=41  
**Eval (spent):** v0.4-routing-fresh n=40 + frontier labels 36144911649

## Honesty (locked)

The protocol line that matters: **v0.4 is spent for choosing knobs.** The 23/40 @ τ=0.80 slice is a **candidate projection on a spent set**, not evidence Decide already passed the ship rule. τ=0.80 was set **after** the four-arm miss (≈0.739) was known — even though the arithmetic can be reproduced from the fit set under the stricter rule.

## Knobs (chronology)

| Knob | Value | When locked |
| --- | --- | --- |
| Model | `fastino/GLiNER2.5-Decide` | four-arm score |
| T | **0.75** `temperature_softmax` | off-set during four-arm report (**before** miss diagnosis) |
| Prior τ | **0.60** | off-set during four-arm (max coverage @ fit prec≥0.9, fit FPs allowed) |
| Candidate τ | **0.80** | **after** miss known; stricter fit rule (prec≥0.9 **and** fit nErrors=0) |

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

## Projection @ τ=0.80 (do not cite as closeout)

| Set | nFired | Errors | Prec | CP 95% LB |
| --- | --- | --- | --- | --- |
| Fit | 23/41 | 0 | 1.0 | ≈85.2% |
| Spent v0.4 | **23/40 (57.5%)** | **0** | 1.0 | ≈85.2% |

Compare: stock reject 18/40 (45%), 0 err, LB 81.5%; prior Decide τ=0.60: 34/40 (85%), **1** err, LB 84.7%. Lower bounds overlap — coverage is not a reason to swap.

## How to read (locked)

1. Live path unchanged: stock T=4 / τ=0.70, `productionTrusted`.
2. Decide is the stronger forced model; gating Decide is the right next shape.
3. Do **not** promote 23/40 @ 0.80. Freeze **v0.5** at **n=70–80**, re-lock τ from fit after freeze, score once, adjudicate, then maybe swap.
4. Do not nudge the v0.5 drafter toward search vs execute.

## Next

See [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md).

# Decide fit / τ lock for v0.5 (after freeze)

**Status:** locked **after** [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md) digests; **before** any v0.5 scores.

**Locked at (UTC):** `2026-09-25T19:10:30Z`

## Locked parameters (Decide candidate path)

| Knob | Value | Source |
| --- | --- | --- |
| Model | `fastino/GLiNER2.5-Decide` | four-arm score dump |
| Calibration | `temperature_softmax` **T=0.75** | off-set temperature grid on fit n=41 |
| Routing τ | **0.80** | fit-only under predeclared 0-error rule |
| Enrichment | off | unchanged |

Artifact: [`frontier-runs/decide-v05-fit-tau-lock.json`](./frontier-runs/decide-v05-fit-tau-lock.json)

## Selection rule (predeclared — unchanged)

Among fit thresholds with precision ≥ 0.90 **and** fit `nErrorsFired = 0`, maximize fire rate; ties → higher τ.

## Fit @ τ=0.80

| Metric | Value |
| --- | --- |
| n | 41 |
| nFired | **23** |
| nErrorsFired | **0** |
| precision among fired | **1.0** |
| CP 95% two-sided LB | ≈**85.2%** |

## Provenance note

The post-miss candidate τ=0.80 on spent v0.4 was **not** citable ([`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)). This lock uses the **same arithmetic on the fit set only**, but the **v0.5 suite is already frozen** and **no v0.5 eval scores were used**. Stock live path remains T=4 / τ=0.70.

## Next

Score-once + frontier adj **done**. Decide **not shipped** (1 fire error under frontier GT). See [`DECIDE_V05_SCORE_ONCE_CLOSEOUT.md`](./DECIDE_V05_SCORE_ONCE_CLOSEOUT.md). Stock live path remains T=4 / τ=0.70.

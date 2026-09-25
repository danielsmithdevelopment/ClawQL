# Decide v0.6 confirmation closeout

**Status:** **scored once** — optional confirmation of the already-live Decide path.  
**Date (UTC):** 2026-09-25  
**Suite:** frozen [`FREEZE-v0.6-routing-fresh.md`](./FREEZE-v0.6-routing-fresh.md) (n=75)  
**Knobs:** locked live — T=0.75 / τ=0.80 / model `fastino/GLiNER2.5-Decide` (not refit)  
**Twins:** [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md)  
**Parent cutover:** [`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)

## Runs

| Step | GHA |
| --- | --- |
| Decide score-once | [36199128704](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36199128704) |
| Frontier adjudication | [36199128630](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36199128630) |

Artifacts: [`frontier-runs/v0.6-decide-gha-36199128704-frontier-closeout.json`](./frontier-runs/v0.6-decide-gha-36199128704-frontier-closeout.json) · [`frontier-runs/v0.6-routing-fresh-gha-36199128630-labels.json`](./frontier-runs/v0.6-routing-fresh-gha-36199128630-labels.json) · [`frontier-runs/v0.6-score-dumps/scores-decide-v06.json`](./frontier-runs/v0.6-score-dumps/scores-decide-v06.json)

## Twin-aware Decide reject arm (frontier GT)

| Metric | Value |
| --- | ---: |
| n | 75 |
| fired | **39** (fireRate 0.52) |
| correct among fires | **37/39** |
| errors among fires | **2** |
| precision among fires | 0.949 |
| 95% CP LB | **≈82.7%** (cite **≈83%**) |

Forced EM (no τ): 70/75 (5 errors). Frontier GT disagreed with provisional on **1** case (`route-v06-015` think twin); rematch numbers match provisional on the reject arm.

## Fire errors (do not retune on these)

| Case | Top (calibrated) | Frontier GT | Note |
| --- | --- | --- | --- |
| `route-v06-040` | `mcp.search` @ ≈0.934 | `mcp.execute` | Known-operation fire phrased with “validated” fields — classic search↔execute miss |
| `route-v06-056` | `mcp.search` @ ≈0.825 | `tool.bash_workspace_hunt` | Repo find/grep bait; Decide preferred search |

Abstaining forced misses (conf < τ): `route-v06-009`, `route-v06-033`, `route-v06-075`.

## Vs live cite

| Claim | Numbers |
| --- | --- |
| **Live cite (unchanged)** | twin-aware v0.5 rematch: **45/75** fires, **0** errors, CP LB **≈92%** ([`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)) |
| **v0.6 confirmation** | **39/75** fires, **2** errors, CP LB **≈83%** |

Confirmation does **not** strengthen the live cite and does **not** reopen the cutover. Live path stays Decide under the V06 spend. Quoting v0.6 as “0-error among fires” would be false.

## What this is not

- Not a fresh `productionTrusted` claim (frontier summary MCE 0.193 > 0.15; confirm arm has fire errors)
- Not a τ retune / GT relabel spend
- Not a reason to swap back to stock

## Markers

`.run-decide-v06` and `.run-frontier-adjudication` cleared after this closeout.

## Docs one-liner

Optional v0.6 confirmation (GHA 36199128704 + 36199128630): Decide @ τ=0.80 fires 39/75 with 2 errors among fires (≈83% LB). Live cite remains twin-aware v0.5 rematch 45/75 @ ≈92% LB.

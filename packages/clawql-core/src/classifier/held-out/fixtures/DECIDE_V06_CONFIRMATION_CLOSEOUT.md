# Decide v0.6 confirmation closeout

**Status:** **scored once** — optional confirmation of the already-live Decide path. **Not a new live cite.**  
**Date (UTC):** 2026-09-25  
**Suite:** frozen [`FREEZE-v0.6-routing-fresh.md`](./FREEZE-v0.6-routing-fresh.md) (n=75)  
**Knobs:** locked live — T=0.75 / τ=0.80 / model `fastino/GLiNER2.5-Decide` (not refit)  
**Twins:** [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md)  
**Parent cutover / live cite:** [`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)

## Locked reading

- **Live cite stays** twin-aware v0.5 rematch: **45/75**, **0** errors, CP LB **≈92%**. Quoting v0.6 as 0-error is false.
- v0.6 numbers: **37/39** → CP 95% LB **≈82.7%** (cite **≈83%**). Fire rate **39/75 (52%)** vs v0.5 rematch **45/75 (60%)**.
- Both fire misses are **real capability misses**, not twins: Decide preferred `mcp.search` while GT was `mcp.execute` / `tool.bash_workspace_hunt`.
- Both misses **fired above τ** (0.934 and 0.825). They never reach abstain committee, low/high frontier, or MoA. Coordination-on-abstain cannot fix a confident wrong fast-path. Under the [Unified Capability Lifecycle](../../../../../docs/specs/classifier/unified-capability-lifecycle-v0.2.md) they would take the **fast path** and execute the wrong committed procedure with no reasoning pass.
- Do **not** retune τ on `040`/`056`. Do **not** swap back to stock. Do **not** put the ≈83% LB on docs.clawql.com as the live number.

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
| fired | **39** (fireRate **0.52**) |
| correct among fires | **37/39** |
| errors among fires | **2** |
| precision among fires | 0.949 |
| 95% CP LB | **≈82.7%** (cite **≈83%** — confirmation only) |

Forced EM (no τ): 70/75 (5 errors). Frontier GT disagreed with provisional on **1** case (`route-v06-015` think twin); rematch numbers match provisional on the reject arm.

## Fire errors (above τ — escalation never sees them)

| Case | Top (calibrated) | Frontier GT | Twin? | Note |
| --- | --- | --- | --- | --- |
| `route-v06-040` | `mcp.search` @ ≈0.934 | `mcp.execute` | **no** | Persist/run phrasing with validated fields — search↔execute residual |
| `route-v06-056` | `mcp.search` @ ≈0.825 | `tool.bash_workspace_hunt` | **no** | Repo find/grep bait — search↔hunt residual |

Abstaining forced misses (conf < τ — slow path *could* see these): `route-v06-009`, `route-v06-033`, `route-v06-075`.

## Vs live cite

| Claim | Numbers | Where it may appear |
| --- | --- | --- |
| **Live cite (unchanged)** | twin-aware v0.5 rematch: **45/75** fires, **0** errors, ≈**92%** LB | docs.clawql.com / product cite |
| **v0.6 confirmation** | **39/75** fires, **2** errors, ≈**83%** LB | this closeout only — **not** the public live number |

## What v0.6 is good for

Shows the live gate generalizes on a fresh catalog slice at **lower coverage** with a **non-zero** fire-error rate. Residual failure class: **search vs execute / workspace-hunt**.

## Next spend (not a τ knob move)

Not a fifth escalation rung. Either:

1. **Catalog/schema** — separate hunt/execute labels; harder negative “search” bait; or
2. **Pre-fire check** on high-τ `mcp.search` when the prompt is persist/run/find-in-repo.

Then a **new frozen suite** after that change — do not retune τ or relabel GT on these 75.

## What this is not

- Not a fresh `productionTrusted` claim
- Not a new live cite / not the number for docs.clawql.com
- Not a τ retune / GT relabel spend
- Not a reason to swap back to stock
- Not evidence that abstain→frontier→MoA would have caught `040`/`056`

## Markers

`.run-decide-v06` and `.run-frontier-adjudication` cleared after this closeout.

## Docs one-liner

Optional v0.6 confirms Decide is still the live CPU fast path; it does not bless 0-error, and the two misses sit *above* τ, so slow-path escalation never sees them. Live cite remains twin-aware v0.5 rematch 45/75 @ ≈92% LB.

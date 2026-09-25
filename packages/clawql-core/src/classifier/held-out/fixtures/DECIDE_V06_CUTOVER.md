# Decide live cutover (v0.6 spend)

**Status:** **LIVE** — Decide is the default Fast Decision routing path.  
**Date (UTC):** 2026-09-25  
**Branch:** `cursor/fast-decision-decide-v06-088d`  
**Spend rule:** [`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)  
**Twins:** [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md)

## Live knobs

| Knob | Value |
| --- | --- |
| Model | `fastino/GLiNER2.5-Decide` (`DEFAULT_GLINER_MODEL_ID`) |
| Calibration | `temperature_softmax` **T=0.75** |
| Routing τ | **0.80** (`search_provider_tool_routing`) |
| Twin correctness | on (declared mcp↔skill pairs) |

Env overrides still work: `CLAWQL_FAST_DECISION_GLINER_MODEL`, `CLAWQL_FAST_DECISION_CALIBRATION_TEMPERATURE`.

## Why cut over now

Twin-aware rematch of frozen v0.5 (same GHA score dumps 36185003105 + frontier labels 36185003282):

| Arm | nFired | nErrors (twin-aware) | CP 95% LB | fireRate |
| --- | ---: | ---: | ---: | ---: |
| stock locked T=4/τ=0.70 | 32 | **0** | ≈89.1% | 0.427 |
| Decide locked T=0.75/τ=0.80 | **45** | **0** | ≈92.1% | **0.600** |

Equal fire errors (0=0) → prefer higher coverage → **Decide**. Both prior “errors” were declared twins.

Report: [`frontier-runs/v0.5-stock-vs-decide-twin-aware-closeout.json`](./frontier-runs/v0.5-stock-vs-decide-twin-aware-closeout.json)

## What did not change

- v0.4 historical claim (stock 0/18 @ τ=0.70) remains true for that suite
- v0.5 suite files / digests unchanged (no GT relabel)
- τ not refit on v0.5 fires
- Ontology enrichment still off

## Code touchpoints

- `gliner-config.ts` — default model Decide
- `temperature-calibration.ts` — default T=0.75
- `use-sites/builtins.ts` — routing τ=0.80
- `candidate-equivalence.ts` — twin pairs + Tag/Layer
- `validation.ts` / `held-out/run-held-out.ts` — twin-aware correctness

## Docs one-liner

Live routing path is Decide @ T=0.75 / τ=0.80 after twin collapse: on frozen v0.5 both arms have 0 twin-aware fire errors and Decide covers 60% vs stock 43%.

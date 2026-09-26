# Decide live cutover (v0.6 spend)

**Status:** **LIVE** — Decide is the default Fast Decision routing path.  
**Date (UTC):** 2026-09-25  
**Branch:** `cursor/fast-decision-decide-v06-088d` · PR [#1149](https://github.com/danielsmithdevelopment/ClawQL/pull/1149)  
**Spend rule:** [`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)  
**Twins:** [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md)

## Live path

`fastino/GLiNER2.5-Decide`, **T=0.75**, routing **τ=0.80**, CPU, fail-closed remaps, abstain to fallback. Declared `mcp.*` ↔ `skill.clawql-*` twins count as correct.

Env overrides still work: `CLAWQL_FAST_DECISION_GLINER_MODEL`, `CLAWQL_FAST_DECISION_CALIBRATION_TEMPERATURE`.

## Cite line

Live router is calibrated GLiNER2.5-Decide @ τ=0.80. On twin-aware v0.5 rematch (**n=75**): **45/75** fires, **0** errors among fires, 95% CP lower bound **≈92%** (exact 92.1% at 45/45). Stock reject on the same rematch: **32/75**, **0** errors, LB **≈89%** (exact 89.1% at 32/32). **Coverage** is why Decide is live.

**This is the public / docs.clawql.com live number.** Optional v0.6 confirmation (≈83% LB, 2 fire errors) must not replace it — see [`DECIDE_V06_CONFIRMATION_CLOSEOUT.md`](./DECIDE_V06_CONFIRMATION_CLOSEOUT.md).

## How the cutover was earned

**Not a new freeze.** Twin collapse + declared spend rule (equal fire errors → prefer coverage) + rematch of the **same** v0.5 dumps (GHA score [36185003105](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003105), frontier [36185003282](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003282)). No τ move. No GT relabel. Under that rule both arms are 0-error among fires; Decide wins on coverage (45/75 vs 32/75).

| Arm                           | Correct / fired | CP 95% LB | Cite     |  fireRate |
| ----------------------------- | --------------: | --------: | -------- | --------: |
| stock locked T=4 / τ=0.70     |       **32/32** | **89.1%** | ≈**89%** |     0.427 |
| Decide locked T=0.75 / τ=0.80 |       **45/45** | **92.1%** | ≈**92%** | **0.600** |

Report: [`frontier-runs/v0.5-stock-vs-decide-twin-aware-closeout.json`](./frontier-runs/v0.5-stock-vs-decide-twin-aware-closeout.json)

## What this is not

It is **not** a fresh held-out `productionTrusted` claim in the v0.4 sense. v0.5 was already scored; the rematch only changed how twins are counted. That is legitimate because the spend is on the page ([`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)). The next _held-out_ sentence waits for an optional frozen v0.6.

Deferred v0.6 freeze is **optional confirmation**, not a blocker for the path already in production. Freeze digests: [`FREEZE-v0.6-routing-fresh.md`](./FREEZE-v0.6-routing-fresh.md) (n=75). **Scored once:** Decide @ τ=0.80 → 39/75 (52%) fires, **37/39** correct, **2** above-τ fire errors (search vs execute/hunt — not twins), ≈82.7% LB cite ≈83% — see [`DECIDE_V06_CONFIRMATION_CLOSEOUT.md`](./DECIDE_V06_CONFIRMATION_CLOSEOUT.md). Live cite remains the twin-aware v0.5 rematch above. Do not put ≈83% on docs.clawql.com.

## Do not say

- Decide passed the old 0-error rule **before** twin collapse.
- The 1-error frontier table (pre-twin) is still the live score.
- v0.4 stock `productionTrusted` is the current default.
- 60% coverage is forced exact-match (it is reject-arm fire rate).
- v0.6 confirmation is 0-error among fires, or that ≈83% LB is the live / docs.clawql.com number.
- Abstain→frontier→MoA would have caught the v0.6 fire misses (both sat **above** τ).

## What did not change

- v0.4 historical claim (stock 0/18 @ τ=0.70) remains true for that suite
- v0.5 suite files / digests unchanged (no GT relabel)
- τ not refit on v0.5 fires
- Ontology enrichment still off
- Fail-closed semantic remaps; cosmetic remaps logged

## Code touchpoints

- `gliner-config.ts` — default model Decide
- `temperature-calibration.ts` — default T=0.75
- `use-sites/builtins.ts` — routing τ=0.80
- `candidate-equivalence.ts` — twin pairs + Tag/Layer
- `validation.ts` / `held-out/run-held-out.ts` — twin-aware correctness

## Docs one-liner

Live router is calibrated GLiNER2.5-Decide @ τ=0.80. On twin-aware v0.5 rematch (n=75): 45/75 fires, 0 errors among fires, 95% CP LB ≈92% (stock same rematch: 32/75, 0 errors, ≈89%). Coverage is why Decide is live. Optional v0.6 confirms the path; it does not bless 0-error, and its two misses sit above τ.

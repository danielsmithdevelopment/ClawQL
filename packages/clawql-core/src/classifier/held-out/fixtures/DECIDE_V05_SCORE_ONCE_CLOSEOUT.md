# Decide v0.5 score-once closeout (frontier GT)

**Tag:** `not-shipped` / `shipEligible=false` / stock remains live  
**Rule:** [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)  
**Suite:** frozen [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md) (n=75)  
**Knobs:** [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md) — Decide T=0.75 / τ=0.80; stock T=4 / τ=0.70  
**GHA:** score-once [36185003105](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003105); frontier [36185003282](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003282)

## Verdict

**Do not swap** the live reject path to Decide. Under frontier-adjudicated GT, Decide locked reject fires **45/75** with **1 error among fires** → fails the predeclared 0-error ship rule. Stock stays live (T=4, τ=0.70).

## Locked-τ arms (frontier GT)

| Arm | nFired | nErrors | precision | CP 95% LB | fireRate |
| --- | ---: | ---: | ---: | ---: | ---: |
| stock forced EM | 75 | 11 | 0.853 | ≈0.753 | 1.00 |
| Decide forced EM | 75 | 6 | 0.920 | ≈0.834 | 1.00 |
| stock locked (T=4, τ=0.70) | **32** | **1** | 0.969 | ≈0.838 | 0.427 |
| Decide locked (T=0.75, τ=0.80) | **45** | **1** | 0.978 | ≈0.882 | 0.600 |

Report: [`frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json`](./frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json)

## Decide reject miss (the ship blocker)

| Field | Value |
| --- | --- |
| caseId | `route-v05-007` |
| Query | Persist this session’s durable outcomes into the vault now. |
| Candidates | `mcp.memory_ingest`, `skill.clawql-memory-ingest` |
| Suite / provisional GT | `mcp.memory_ingest` |
| Frontier GT | `skill.clawql-memory-ingest` |
| Decide top @ T=0.75 | `mcp.memory_ingest` @ conf **≈0.841** (≥ τ=0.80 → fires) |
| Kind | mcp↔skill twin preference (frontier prefers skill wrapper); **not** a wrong-capability miss like `route-v04-004` |

Artifact: [`frontier-runs/v0.5-stock-vs-decide-reject-errors.json`](./frontier-runs/v0.5-stock-vs-decide-reject-errors.json)

## Stock note (honesty, not a retune)

On this same frontier GT, stock locked also has **1** fire error (`route-v05-023`: `mcp.clawql_think` vs frontier `skill.deep-thinking`). That does **not** revoke v0.4 `productionTrusted` (different suite). It does mean v0.5 is not a free 0-error win for either arm under skill-preferring frontier labels.

## Frontier labels

- 75/75 live labels; judge `claude-sonnet-4-6`; scorerBackend `gliner2`
- Provisional suite GT agrees on **70/75**; 5 disagreements are all mcp→skill twin preferences
- Remap array empty (both IDs were in-candidate; judge chose skill)
- Labels: [`frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json`](./frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json)

## What we do **not** do

- Hot-swap Decide despite higher coverage (45 vs 32) and stronger forced EM
- Retune τ after seeing v0.5 fires (new spend)
- Cite the provisional-GT 0/0 reject table as closeout (needs frontier GT)

## Next (if pursuing Decide again)

Cut a new suite / new spend under the three-set protocol, or predeclare a different ship rule (e.g. CP LB ≥ stock) **before** looking at the next eval scores. Diagnosis of mcp↔skill twin labeling is allowed on this spent v0.5 set.

## Team one-liner

Decide@0.80 covers more of frozen v0.5 than stock@0.70 but still has one fire error under frontier GT (mcp vs skill twin); stock remains the live 0-error on-ramp from the v0.4 closeout.

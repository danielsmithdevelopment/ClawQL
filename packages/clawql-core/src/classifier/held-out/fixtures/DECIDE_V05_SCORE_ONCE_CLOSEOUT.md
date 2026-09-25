# Decide v0.5 score-once closeout (frontier GT)

**Tag:** `not-shipped` / `shipEligible=false` / stock remains live  
**Rule:** [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)  
**Suite:** frozen [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md) (n=75)  
**Knobs:** [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md) — Decide T=0.75 / τ=0.80; stock T=4 / τ=0.70  
**GHA:** score-once [36185003105](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003105); frontier [36185003282](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003282) · PR [#1148](https://github.com/danielsmithdevelopment/ClawQL/pull/1148)

## Locked verdict

**No cutover.** Decide still has **1 error among fires** on a fresh suite, so it fails “ship only if 0 errors among fires.” Live path stays stock GLiNER 2.5 @ (T=4, τ=0.70). v0.4 `productionTrusted` is **not** rewritten. Retuning τ on these 75 fires is a **new spend**.

Intervals (cite these):

| Arm | Correct / fired | CP 95% LB | Cite |
| --- | ---: | ---: | --- |
| stock locked | **31/32** | **83.8%** | ≈**84%** @ 43% coverage |
| Decide locked | **44/45** | **88.2%** | ≈**88%** @ 60% coverage |

Decide @ (T=0.75, τ=0.80) is a **higher-coverage candidate** (60% vs 43%) with **overlapping** precision bounds — not a more precise gate.

## Locked-τ arms (frontier GT)

| Arm | nFired | nErrors | precision | CP 95% LB | fireRate |
| --- | ---: | ---: | ---: | ---: | ---: |
| stock forced EM | 75 | 11 | 0.853 | ≈0.753 | 1.00 |
| Decide forced EM | 75 | 6 | 0.920 | ≈0.834 | 1.00 |
| stock locked (T=4, τ=0.70) | **32** | **1** | 0.969 | ≈0.838 | 0.427 |
| Decide locked (T=0.75, τ=0.80) | **45** | **1** | 0.978 | ≈0.882 | 0.600 |

Report: [`frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json`](./frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json)

## What the table does not hide

### 1. Live path is not 0-error on fresh data

Stock reject on v0.5: **32/75** fires, **1** error. That does **not** revoke the v0.4 closeout (different frozen set; knobs already spent). Do **not** keep saying the live arm “never wrong on fires” as a present-tense fact.

| Suite | Stock reject fires | Errors | Cite |
| --- | ---: | ---: | --- |
| v0.4 | 18/40 (45%) | **0/18** | ≈82% LB |
| v0.5 | 32/75 (43%) | **1/32** | ≈84% LB |

**Honest live-path claim now:** ≈**84%** precision LB at ≈**43%** coverage on v0.5, consistent with v0.4’s ≈82%.

Stock’s miss is **`route-v05-023`** (not the Decide blocker): suite/provisional GT `mcp.clawql_think`; frontier GT `skill.deep-thinking`; stock top `mcp.clawql_think` @ ≈0.733 (≥ τ=0.70). Same twin class, different case.

### 2. Decide beat stock on both measures; the rule blocked it anyway

Decide fires more (60% vs 43%) with a higher LB (≈88% vs ≈84%); both made exactly one error. A 0-error-only rule that the incumbent also fails on fresh data is not comparing the arms fairly — but the rule was **predeclared**, so this round’s verdict stands. For **v0.6**, declare the comparison rule **before** scoring, e.g.:

> Ship the candidate if its CP 95% LB is at least the live arm’s **and** its coverage is at least as high.

### 3. The Decide miss is catalog twin ambiguity, not a capability misroute

| Field | Value |
| --- | --- |
| caseId | `route-v05-007` |
| Query | Persist this session’s durable outcomes into the vault now. |
| Candidates | `mcp.memory_ingest`, `skill.clawql-memory-ingest` |
| Suite / provisional GT | `mcp.memory_ingest` |
| Frontier GT | `skill.clawql-memory-ingest` |
| Decide top @ T=0.75 | `mcp.memory_ingest` @ conf **≈0.841** (≥ τ=0.80 → fires) |
| vs `route-v04-004` | **Different class** — that was execute→search; this is a twin/alias collision |

**Adjudicator choice (locked):** frontier is the scoring authority; suite GT can disagree with the judge on twins. Under that choice, Decide’s fire is an error by construction → ship rule fails. If suite GT were authority, Decide did not misroute capability.

Do **not** relabel v0.5 now — changing GT after seeing that it flips the verdict is the same post-hoc problem as retuning τ.

Artifact: [`frontier-runs/v0.5-stock-vs-decide-reject-errors.json`](./frontier-runs/v0.5-stock-vs-decide-reject-errors.json)

## Frontier labels

- 75/75 live labels; judge `claude-sonnet-4-6`; scorerBackend `gliner2`
- Provisional suite GT agrees on **70/75**; 5 disagreements are all mcp→skill twin preferences
- Remap array empty (both IDs were in-candidate; judge chose skill)
- Labels: [`frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json`](./frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json)

## What we do **not** do

- Hot-swap Decide despite higher coverage and higher LB
- Retune τ after seeing v0.5 fires
- Relabel twin GTs on v0.5 after seeing the verdict flip
- Cite provisional-GT 0/0 reject tables as closeout
- Claim the live arm is presently “never wrong on fires”

## Order for next round (v0.6)

1. **Resolve tool/skill twins in the catalog** — either one equivalence class that counts as a single correct answer, or `distinguishFrom` text when the skill wrapper is preferred over the raw tool.
2. **Declare the ship / comparison rule** before any scores (example above).
3. **Freeze v0.6** (blind; digests).
4. **Score once** and frontier-adjudicate.

## Docs one-liner

v0.5 (n=75, GHA 36185003105 / 36185003282, PR #1148): Decide reject covers more (45/75 vs 32/75) but still has 1 fire error under frontier adjudication, so stock stays the live CPU on-ramp. The Decide miss is a memory-ingest twin (`mcp.*` vs `skill.*`), not a wrong-capability route. Next spend is a new frozen suite or an explicit twin-resolution rule in the catalog — not a τ bump on this set.

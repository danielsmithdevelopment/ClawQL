# Decide v0.5 score-once closeout (frontier GT)

**Tag:** `not-shipped` / `shipEligible=false` / stock remains live  
**Rule:** [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)  
**Suite:** frozen [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md) (n=75)  
**Knobs:** [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md) — Decide T=0.75 / τ=0.80; stock T=4 / τ=0.70  
**GHA:** score-once [36185003105](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003105); frontier [36185003282](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36185003282) · PR [#1148](https://github.com/danielsmithdevelopment/ClawQL/pull/1148)

## Locked verdict (this cycle)

**No cutover tonight.** Do not flip the live pointer on coverage alone. Do not treat “both have 1 error” as a Decide auto-win. Live path stays stock GLiNER 2.5 @ (T=4, τ=0.70). v0.4 `productionTrusted` is **not** rewritten. Retuning τ — or promoting Decide because the table looks good — is a **new spend**.

Intervals (cite these):

| Arm | Correct / fired | CP 95% LB | Cite |
| --- | ---: | ---: | --- |
| stock locked | **31/32** | **83.8%** | ≈**84%** @ 43% coverage |
| Decide locked | **44/45** | **88.2%** | ≈**88%** @ 60% coverage |

Decide @ (T=0.75, τ=0.80) is a **higher-coverage candidate** (60% vs 43%) with **overlapping** precision bounds — not a more precise gate. The +13 catalog routes (45 vs 32) that never hit the frontier are a real ops gain, not a vanity metric.

## Locked-τ arms (frontier GT)

| Arm | nFired | nErrors | precision | CP 95% LB | fireRate |
| --- | ---: | ---: | ---: | ---: | ---: |
| stock forced EM | 75 | 11 | 0.853 | ≈0.753 | 1.00 |
| Decide forced EM | 75 | 6 | 0.920 | ≈0.834 | 1.00 |
| stock locked (T=4, τ=0.70) | **32** | **1** | 0.969 | ≈0.838 | 0.427 |
| Decide locked (T=0.75, τ=0.80) | **45** | **1** | 0.978 | ≈0.882 | 0.600 |

Report: [`frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json`](./frontier-runs/v0.5-stock-vs-decide-gha-36185003105-closeout.json)

## Side-by-side fire errors (both on the page)

| Arm | caseId | Model top | Suite GT | Frontier GT | Kind |
| --- | --- | --- | --- | --- | --- |
| Decide | `route-v05-007` | `mcp.memory_ingest` @ ≈0.841 | `mcp.memory_ingest` | `skill.clawql-memory-ingest` | mcp↔skill twin |
| Stock | `route-v05-023` | `mcp.clawql_think` @ ≈0.733 | `mcp.clawql_think` | `skill.deep-thinking` | mcp↔skill twin |

Neither miss is execute→search (`route-v04-004` class). Both matched suite GT; frontier preferred the skill twin. Under frontier authority they count as errors; under suite GT neither misrouted capability. The “1 vs 1” table is mostly an ontology/adjudicator artifact.

Artifact: [`frontier-runs/v0.5-stock-vs-decide-reject-errors.json`](./frontier-runs/v0.5-stock-vs-decide-reject-errors.json)

## What the table does not hide

### 1. Live path is not 0-error on fresh data

| Suite | Stock reject fires | Errors | Cite |
| --- | ---: | ---: | --- |
| v0.4 | 18/40 (45%) | **0/18** | ≈82% LB |
| v0.5 | 32/75 (43%) | **1/32** | ≈84% LB |

**Honest live-path claim now:** ≈**84%** precision LB at ≈**43%** coverage on v0.5. Do not say the live arm is presently “never wrong on fires.”

### 2. Decide is the stronger catalog model; protocol is why we wait

v0.4 forced EM (92.5% vs 80%) and v0.5 coverage (60% vs 43%) point the same way. Hesitation is protocol, not model quality: changing the ship rule or cutover after seeing fires is a spend. Keep this round’s 0-error verdict.

### 3. Twins are ontology bugs, not model errors

**Adjudicator choice (locked for v0.5 scoring):** frontier is the scoring authority; suite GT can disagree on twins. Do **not** relabel v0.5 now — that flips the verdict post-hoc.

## Cutover policy (logged — switch only when all three hold)

Keep stock live this cycle. Cut over to Decide @ (T=0.75, τ=0.80) **only if**:

1. Stock’s v0.5 miss is written up next to `route-v05-007` and is not cleaner than the twin. (**Done** — `route-v05-023` is also a twin.)
2. The catalog treats `mcp.*` / `skill.clawql-*` twins as one allowed answer (or the judge must accept either).
3. The new ship rule is declared in the eval log **as a spend**: equal fire-error count → prefer higher coverage; twins are ontology bugs, not model errors.

If (1)–(3) hold, switch — that is the right long-term path. If twins are not collapsed yet, wait: buying +13 coverage while leaving a known alias that can manufacture the next “error” is not worth it.

## Frontier labels

- 75/75 live labels; judge `claude-sonnet-4-6`; scorerBackend `gliner2`
- Provisional suite GT agrees on **70/75**; 5 disagreements are all mcp→skill twin preferences
- Remap array empty (both IDs were in-candidate; judge chose skill)
- Labels: [`frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json`](./frontier-runs/v0.5-routing-fresh-gha-36185003282-labels.json)

## What we do **not** do

- Flip the live pointer on coverage alone
- Treat “both have 1 error” as a Decide auto-win without (1)–(3)
- Hot-swap Decide tonight because the table looks good
- Retune τ after seeing v0.5 fires
- Relabel twin GTs on v0.5 after seeing the verdict flip
- Claim the live arm is presently “never wrong on fires”

## Order for next round (v0.6)

1. Collapse tool/skill twins in the catalog (equivalence class, or judge accepts either).
2. Declare the comparison/ship rule **as a spend** (equal fire-errors → prefer higher coverage; twins ≠ model errors).
3. Freeze v0.6 (blind; digests).
4. Score once + frontier-adjudicate; cut over to Decide if (1)–(3) still hold.

## Docs one-liner

Decide should probably be live next — not because 60% beats 43%, but because it is the stronger model and its only v0.5 fire error is a catalog twin (stock’s only fire error is also a twin). Switch after that twin is collapsed and stock’s miss is on the page, not off the table; keep stock live this cycle.

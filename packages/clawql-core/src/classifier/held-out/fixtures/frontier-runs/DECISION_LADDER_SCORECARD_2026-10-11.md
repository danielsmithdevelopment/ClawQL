# Decision ladder scorecard (2026-10-11)

Honest readout after merging spend-ledger → provider pricing → Decision-1 flip-rate pin → held-out candidate harness. **Not a productionTrusted claim.**

## What shipped (structural)

| Rung                                      | PR      | Status                              |
| ----------------------------------------- | ------- | ----------------------------------- |
| Spend-ledger `costSource=spend_ledger`    | #1255   | Merged                              |
| Provider/model token pricing              | #1267   | Merged                              |
| Flip-rate `model` pin → Decision-1        | #1268   | Merged                              |
| Held-out → fan-out + candidate report     | #1269   | Merged                              |
| Operator fill via Actions marker          | #1273   | Filled (bulk; synonym flip vacated) |
| Full flip-family remeasure + vacuous gate | #1278   | Filled                              |
| Twin-aware fan-out `matchMode`             | #1279   | Merged    |
| Candidate costSource / local costPerCase=0 | this PR | In flight |

## Live Decision-1 v0.4 candidate (Actions, keyed — full families)

Artifact: [`decision1-v04-routing-candidate.json`](./decision1-v04-routing-candidate.json)  
Source: filledAt `2026-10-12T04:34:40.310Z`, `flipFamilies=["whitespace","case","punctuation","synonym"]`, `openRouterKeyed=true`.

| Backend      | Answered | Correct | Wrong | Meets quality bar |
| ------------ | -------- | ------- | ----- | ----------------- |
| local (stub) | 8/40     | 6       | 2     | no                |
| Decision-1   | 40/40    | 40      | 0     | **yes**           |

- **Bulk recommendation:** `openrouter/microsoft/microsoft-decision-1` (first backend with maxWrong=0).
- **Flip-rate (full families):** **passed** — `totalPerturbations=200`, 0 flips, all 40 cases non-vacuous, `maxFlipRate=0.1`.
- **Prior synonym-only #1273 cite vacated** (`totalPerturbations=0`).
- **Verdict:** `productionTrustedClaim: false`, `calibratedClaim: false` (honesty rails held).

## What improved (obvious)

- **Decision-1 clears the fan-out quality bar on labeled v0.4** (40/40 exact option-id) while local stub does not (6/8 answered).
- **Non-vacuous flip-rate pass** under Decision-1 model pin (200 comparable perturbations, 0 flips).
- **Vacuous synonym passes fail closed** (`totalPerturbations === 0`).
- **Honesty rails held**: remotes stay `productionTrustedClaim: false`; GLiNER2 remains the only path that can light trust.

## What did _not_ improve

- **No trust transfer**: Decision-1 still cannot enter `PRODUCTION_TRUSTED_SCORER_BACKEND`.
- **Twin matchMode (this ladder step)**: Decision-1 candidate bulk now uses `matchMode: twin` (`candidatesEquivalent`). Numbers on v0.4 may not move (already 40/40 exact); protocol honesty vs GLiNER improves. GLiNER live trusted path remains ~0.80 rawAcc / 18 accepted @ τ=0.70.
- **Local stub** (no `CLAWQL_FAST_DECISION_GLINER_URL` in measure job) is not a GLiNER baseline — only a fail-closed local contrast.

## Baseline references

| Artifact                                            | Meaning                                       |
| --------------------------------------------------- | --------------------------------------------- |
| `v0.4-routing-fresh-productionTrusted-readout.json` | Live GLiNER2 + frontier labels — trusted path |
| `decision1-v04-routing-candidate-TEMPLATE.json`     | Empty measure template                        |
| `decision1-v04-routing-candidate.json`              | Filled Decision-1 candidate (this PR)         |

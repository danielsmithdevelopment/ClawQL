# Decision ladder scorecard (2026-10-11)

Honest readout after merging spend-ledger → provider pricing → Decision-1 flip-rate pin → held-out candidate harness. **Not a productionTrusted claim.**

## What shipped (structural)

| Rung                                   | PR      | Status |
| -------------------------------------- | ------- | ------ |
| Spend-ledger `costSource=spend_ledger` | #1255   | Merged |
| Provider/model token pricing           | #1267   | Merged |
| Flip-rate `model` pin → Decision-1     | #1268   | Merged |
| Held-out → fan-out + candidate report  | #1269   | Merged |
| Operator fill via Actions marker       | #1273   | Filled (bulk) |
| Full flip-family remeasure + vacuous gate | this PR | In flight |

## Live Decision-1 v0.4 candidate (Actions, keyed)

Artifact: [`decision1-v04-routing-candidate.json`](./decision1-v04-routing-candidate.json)  
Source: workflow run filledAt `2026-10-11T19:27:22.240Z`, `flipFamilies=["synonym"]`, `openRouterKeyed=true`.

| Backend      | Answered | Correct | Wrong | Meets quality bar |
| ------------ | -------- | ------- | ----- | ----------------- |
| local (stub) | 8/40     | 6       | 2     | no                |
| Decision-1   | 40/40    | 40      | 0     | **yes**           |

- **Bulk recommendation:** `openrouter/microsoft/microsoft-decision-1` (first backend with maxWrong=0).
- **Flip-rate (synonym) — VACATED:** reported pass but `totalPerturbations=0` (synonym swaps never hit routing-fresh text). Not evidence.
- **Verdict:** `productionTrustedClaim: false`, `calibratedClaim: false` (honesty rails held).

## Remeasure (this PR)

- Flip-rate suite now **fails closed** when `totalPerturbations === 0`.
- Default families: `whitespace,case,punctuation,synonym` (non-vacuous on routing text).
- Replace artifact + cite flip pass/fail only after full-family fill lands.

## What improved (obvious)

- **Decision-1 clears the fan-out quality bar on labeled v0.4** (40/40 exact option-id) while local stub does not (6/8 answered).
- **Operator can compare backends with live spend + pricing** instead of only explicit `costPerCase`.
- **Honesty rails held**: remotes stay `productionTrustedClaim: false`; GLiNER2 remains the only path that can light trust.
- **Vacuous synonym pass cannot be cited** after this PR’s fail-closed gate.

## What did _not_ improve

- **No trust transfer**: Decision-1 still cannot enter `PRODUCTION_TRUSTED_SCORER_BACKEND`.
- **Not apples-to-apples with GLiNER trusted readout**: fan-out uses exact option-id match, not twin-aware held-out scoring. GLiNER live trusted path remains ~0.80 rawAcc / 18 accepted @ τ=0.70 on the same suite.
- **Local stub** (no `CLAWQL_FAST_DECISION_GLINER_URL` in measure job) is not a GLiNER baseline — only a fail-closed local contrast.

## Baseline references

| Artifact                                            | Meaning                                       |
| --------------------------------------------------- | --------------------------------------------- |
| `v0.4-routing-fresh-productionTrusted-readout.json` | Live GLiNER2 + frontier labels — trusted path |
| `decision1-v04-routing-candidate-TEMPLATE.json`     | Empty measure template                        |
| `decision1-v04-routing-candidate.json`              | Filled Decision-1 candidate (this PR)         |

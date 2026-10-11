# Decision ladder scorecard (2026-10-11)

Honest readout after merging spend-ledger → provider pricing → Decision-1 flip-rate pin → held-out candidate harness. **Not a productionTrusted claim.**

## What shipped (structural)

| Rung | PR | Status |
| ---- | -- | ------ |
| Spend-ledger `costSource=spend_ledger` | #1255 | Merged |
| Provider/model token pricing | #1267 | Merged |
| Flip-rate `model` pin → Decision-1 | #1268 | Merged |
| Held-out → fan-out + candidate report | #1269 | Merged |
| Operator fill via Actions marker | this PR | In flight |

## What improved (obvious)

- **Operator can compare backends with live spend + pricing** instead of only explicit `costPerCase`.
- **Decision-1 is measurable** under the same flip-rate suite and fan-out bulk as local — fail-closed when unkeyed.
- **Honesty rails held**: every new surface keeps `calibrated` / `productionTrustedClaim: false` for remotes; GLiNER2 remains the only path that can light trust.

## What did *not* improve (yet)

- **No Decision-1 accuracy / flip-rate numbers on v0.4** until `OPENROUTER_API_KEY` is available to Actions (or this agent). Unkeyed local smoke: Decision-1 `skipped=40`, flip-rate `skipped=true`.
- **Local stub scorer on this VM** (no `CLAWQL_FAST_DECISION_GLINER_URL`): answered 8/40 on labeled v0.4 — **not** comparable to GLiNER live `productionTrusted` (0.80 rawAcc / 18 accepted @ τ=0.70 on the same suite).
- **No trust transfer**: Decision-1 still cannot enter `PRODUCTION_TRUSTED_SCORER_BACKEND`.

## Baseline references (already on main)

| Artifact | Meaning |
| -------- | ------- |
| `v0.4-routing-fresh-productionTrusted-readout.json` | Live GLiNER2 + frontier labels — trusted path |
| `decision1-v04-routing-candidate-TEMPLATE.json` | Empty measure template |
| This marker workflow | Fills Decision-1 candidate when secret present |

## How to read the upcoming Actions artifact

Cite Decision-1 bulk correct/wrong + flip-rate pass **only** from a keyed run. Compare to GLiNER trusted readout carefully: fan-out uses exact option-id match, not twin-aware held-out scoring.

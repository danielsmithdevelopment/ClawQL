# Multi-attack injection — fairness

## Columns

| Column          | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| **Defaults**    | Stock product, no cell-specific deny for `memory_ingest`                       |
| **Best-config** | Each product’s recommended deny / scope for the write the attacks try to force |

## Metric

`attacks_effectuated / attacks_planted`

- **Planted:** entries in `corpus/manifest.json`
- **Effectuated (smoke):** vault `Memory/` contains the attack’s `effectToken`
- **Effectuated (live, later):** real model complies with the planted instruction

## Credibility

Peers that do not offer an injection / tool-gate board for this corpus are **`not_offered`**, never scored `0`.

## Honesty

- Smoke is **scripted** — proves harness counting + configured deny, not LLM susceptibility.
- Live “0 of N” requires `results-live.json` with real models on the same corpus.
- A tool-name deny is best-config; content-aware ATR / taint is a separate design cell.

## Artifacts

- Frozen rules: `scripts/benchmarks/multi-attack-injection/frozen-rules.json`
- Smoke results: [`results-smoke.json`](./results-smoke.json)
- Harness: `scripts/benchmarks/multi-attack-injection/run-board.mjs`

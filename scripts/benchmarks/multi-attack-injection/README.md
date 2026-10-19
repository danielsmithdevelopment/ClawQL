# Multi-attack injection board

Build-first **#1** from [security-suite/ROADMAP.md](../../../docs/benchmarks/security-suite/ROADMAP.md).

## What it measures

`attacks_effectuated / attacks_planted` across planted instructions in **email**, **ticket**, **doc**, and **webhook** channels.

## Smoke (this PR)

```bash
npm run benchmark:multi-attack-injection
```

Scripted complying agent + Panguard tool-name gate:

| Arm | Expect |
| --- | ------ |
| `clawql_default` | N/N effectuated (stock has no tool deny) |
| `clawql_configured` | 0/N (BLOCK_TOOLS=memory_ingest) |
| `passthrough` | N/N control |
| Obot / Bifrost / Executor | `not_offered` |

Corpus: `benchmarks/security-suite/multi-attack-injection/corpus/` (12 attacks).

## Live (follow-up)

Real models reading planted channels → `results-live.json`. Do not claim “0 of N” on clawql.com until that artifact exists.

## Fairness

Same columns as governance: defaults + best-config, frozen rules, published harness, maintainer invite. Missing peer capability → `not_offered`, never `0`.

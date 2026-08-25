# Agents OpenBench harness (Phase 5)

Canonical location for the ClawQL × open-source-agents benchmark harness.

| Piece                            | Location                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Plan / gates                     | [`docs/benchmarks/agents-openbench-plan.md`](../../docs/benchmarks/agents-openbench-plan.md)           |
| Task / scorecard spec            | [`docs/benchmarks/agents-openbench-spec-v0.1.md`](../../docs/benchmarks/agents-openbench-spec-v0.1.md) |
| Dry runner (session + stub arms) | `clawql-agents` → `runAgentBenchmarkDry`                                                               |
| Existing MCP OpenBench           | [`openbench/`](../../openbench/) (Track A/B — different product)                                       |

## Dry run (today)

```bash
npm run build -w clawql-agents
node integrations/agents-bench/scripts/dry-run.mjs cline S
```

Live model A/B arms stay **gated** until Harvey LAB + ExtractBench publish criteria in the plan are met. Do **not** add a second `bench/` tree under `packages/clawql-agents/`.

## Fixtures

- `fixtures/family-s-smoke.json` — one smoke task per agent family S shape

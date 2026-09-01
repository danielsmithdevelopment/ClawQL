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

Family **S** tasks run real ATR checkers (`enforceToolCall`): allow `memory_recall` / `email_read`, deny `execute` / `email_send`, via harness stubs in `catalog/family-s-stub-tools.json`.

Live model A/B arms stay **gated** until Harvey LAB + ExtractBench publish criteria in the plan are met. Do **not** add a second `bench/` tree under `packages/clawql-agents/`.

## Catalog

- `catalog/family-s-stub-tools.json` — harness-local Family S tools (`email_*`, `calendar_*`, …); never MCP
- Typed twin: `clawql-agents` → `FAMILY_S_STUB_TOOLS` / `FAMILY_S_READONLY_ATR`

## Fixtures

- `fixtures/family-s-smoke.json` — ATR deny/allow smoke with scope checks

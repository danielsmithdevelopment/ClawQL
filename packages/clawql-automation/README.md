# clawql-automation

Scheduling and notifications extracted from `clawql-mcp` (modularization phase 9, [#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)): persisted synthetic checks (`schedule` MCP tool) and Slack `notify` via the loaded spec's `chat_postMessage` operation.

## Plugin entry

When `CLAWQL_ENABLE_SCHEDULE=1`, `CLAWQL_ENABLE_NOTIFY=1`, and/or `CLAWQL_ENABLE_WORKFLOW=1` (planned), **`AutomationPlugin`** (`createAutomationPlugin` from `clawql-automation/plugin`) registers MCP tools via `onRegister`, starts the schedule worker when schedule is enabled, and stops it on `onTeardown`. Composed from `buildMcpPlugins()` in `src/clawql-api-adapters.ts`.

Call `configureAutomationPluginDeps({ execute })` from the MCP transport layer before notify/schedule handlers invoke `execute` (e.g. Slack `chat_postMessage`).

## Subpath imports

Prefer subpath imports (`clawql-automation/schedule/schedule`, `clawql-automation/notify/notify`, `clawql-automation/workflow/workflow` when shipped) for direct handler access in tests and transport glue.

## Roadmap (not shipped)

| Feature                                  | Status                                   | Tracking                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Argo Workflows `workflow` MCP tool       | **Designed** — extends `AutomationPlugin` (template-only v1, `@kubernetes/client-node`, Argo ≥ 3.4.0) | [Design doc](../../docs/design/workflow-tool-argo.md), [ADR 0004](../../docs/adr/0004-argo-cd-workflows-clawql-pipelines.md), [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) |
| Argo CD GitOps provider                  | **Planned**                              | [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)                                                                        |
| NATS / HITL suspend-resume orchestration | **Planned**                              | [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                                        |

See [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md) and [`docs/reference/clawql-plugin-registry.md`](../../docs/reference/clawql-plugin-registry.md).

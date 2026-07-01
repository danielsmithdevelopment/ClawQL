# clawql-automation

Scheduling and notifications extracted from `clawql-mcp` (modularization phase 9, [#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)): persisted synthetic checks (`schedule` MCP tool) and Slack `notify` via the loaded spec's `chat_postMessage` operation.

## Plugin entry

When `CLAWQL_ENABLE_SCHEDULE=1`, `CLAWQL_ENABLE_NOTIFY=1`, and/or `CLAWQL_ENABLE_WORKFLOW=1` (planned), **`AutomationPlugin`** (`createAutomationPlugin` from `clawql-automation/plugin`) registers MCP tools via `onRegister`, starts the schedule worker when schedule is enabled, and stops it on `onTeardown`. Composed from `buildMcpPlugins()` in `src/clawql-api-adapters.ts`.

Call `configureAutomationPluginDeps({ execute })` from the MCP transport layer before notify/schedule handlers invoke `execute` (e.g. Slack `chat_postMessage`).

## Subpath imports

Prefer subpath imports (`clawql-automation/schedule/schedule`, `clawql-automation/notify/notify`, `clawql-automation/workflow/workflow` when shipped) for direct handler access in tests and transport glue.

## Roadmap (not shipped)

| Feature                                  | Status                                                                             | Tracking                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Argo Workflows `workflow` MCP tool       | **Shipped** (opt-in) — extends `AutomationPlugin`                                  | [Design doc](../../docs/design/workflow-tool-argo.md), `CLAWQL_ENABLE_WORKFLOW=1`, [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) |
| Vault daily digest WorkflowTemplate      | **Shipped** — `deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml` | `npm run workflow:vault-digest` (local); Argo template `clawql-vault-daily-digest`                                                                     |
| Argo CD GitOps provider                  | **Shipped** (`argocd` MCP tool)                                                    | [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)                                                                                    |
| NATS / HITL suspend-resume orchestration | **Shipped** (`workflow` suspend/resume + webhook auto-resume)                      | [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                                                    |

See [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md) and [`docs/reference/clawql-plugin-registry.md`](../../docs/reference/clawql-plugin-registry.md).

# clawql-automation

Scheduling, notifications, and Argo Workflows extracted from `clawql-mcp` (modularization phase 9, [#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)): persisted synthetic checks (`schedule` MCP tool), Slack `notify` via the loaded spec's `chat_postMessage` operation, and optional **`workflow`** / **`argocd`** (Argo Workflows + Argo CD control plane).

## Plugin entry

When `CLAWQL_ENABLE_SCHEDULE=1`, `CLAWQL_ENABLE_NOTIFY=1`, `CLAWQL_ENABLE_WORKFLOW=1`, and/or `CLAWQL_ENABLE_ARGO_CD=1`, **`AutomationPlugin`** (`createAutomationPlugin` from `clawql-automation/plugin`) registers MCP tools via `onRegister`, starts the schedule worker when schedule is enabled, and stops it on `onTeardown`. Composed from `buildMcpPlugins()` in `src/clawql-api-adapters.ts`.

Call `configureAutomationPluginDeps({ execute })` from the MCP transport layer before notify/schedule handlers invoke `execute` (e.g. Slack `chat.postMessage`).

## Subpath imports

Prefer subpath imports (`clawql-automation/schedule/schedule`, `clawql-automation/notify/notify`, `clawql-automation/workflow/workflow`, `clawql-automation/argocd/argocd`) for direct handler access in tests and transport glue.

## Shipped vs roadmap

| Feature                                   | Status                                                                             | Tracking                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argo Workflows `workflow` MCP tool        | **Shipped** (opt-in) — extends `AutomationPlugin`                                  | [Design doc](../../docs/design/workflow-tool-argo.md), [operator guide](../../docs/mcp/workflow-tool.md), `CLAWQL_ENABLE_WORKFLOW=1`, [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) |
| Vault daily digest WorkflowTemplate       | **Shipped** — `deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml` | `npm run workflow:vault-digest` (local); Argo template `clawql-vault-daily-digest`                                                                                                                        |
| `suspend` / `resume` + HITL auto-resume   | **Shipped**                                                                        | [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                                                                                                       |
| `submit_cron`, `artifacts` (workflow ops) | **Shipped**                                                                        | [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)                                                                                                                                       |
| Argo CD `argocd` MCP tool                 | **Shipped** (opt-in)                                                               | [argocd-tool.md](../../docs/mcp/argocd-tool.md), `CLAWQL_ENABLE_ARGO_CD=1`, [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)                                                           |
| NATS event bus for workflow orchestration | **Shipped** (publish + HITL resume consumer)                                       | [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127), [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)                                                                                                                                       |

See [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md) and [`docs/reference/clawql-plugin-registry.md`](../../docs/reference/clawql-plugin-registry.md).

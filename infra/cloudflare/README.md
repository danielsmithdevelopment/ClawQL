# Hosted-edge Cloudflare Workers

**Not** the Cloudflare OpenAPI provider (`providers/cloudflare/`). These Workers are GTM/hosted-edge adapters: a thin MCP-shaped surface on Cloudflare, a `sandbox_exec` HTTP bridge, and an optional CORS proxy.

Canonical ClawQL MCP is Node **`clawql-mcp`** / Helm **`manifests/charts/clawql-mcp`**, not this tree.

## Must update to ClawQL 8.0.0

This code **lags ClawQL 8.0.0** and must be brought current with the post-8.0 design before it is treated as a product MCP surface. Do not extend the Worker catalog as if it were `clawql-mcp`.

| 8.0.0 (Node / Helm) | These Workers today |
| ------------------- | ------------------- |
| Empty bundled catalog until `CLAWQL_PROVIDER` / Helm `providers.pack` | Hardcoded edge ops in `gateway/src/catalog.ts` |
| `ProviderPlugin` only (no legacy `Plugin` / `beforeCallTool`) | Parallel REST + JSON-RPC subset, not the plugin host |
| Enforcement default off (`CLAWQL_PANGUARD_PROXY_PLUGIN=1` to restore) | No Panguard / ATR pipeline |
| Skills-unified `search` + `skills_list` / `skills_get` | Ad-hoc `/search` `/execute` `/memory_*` `/cache` |
| `audit` / `cache` / memory packages + OKF vault | D1 `appendAudit`, R2 Markdown, KV — not `clawql-audit` |

**Sources:** [migrate to 8.0](../../docs/getting-started/migrate-to-8.0.md), [8.0.0 release notes](../../docs/release/RELEASE_NOTES_v8.0.0.md), [plugin architecture](../../docs/design/clawql-core-plugin-architecture.md).

Fabric ladder (edge Worker is rung 1, still a lagging implementation): [gateway-fabric.md](../../docs/deployment/gateway-fabric.md).

## Layout

| Path | Role |
| ---- | ---- |
| [`gateway/`](gateway/) | Phase 1 edge Worker (R2 / D1 / KV / Stripe). Pulumi `edge` deploys `gateway/dist/index.js`. |
| [`sandbox-bridge/`](sandbox-bridge/) | HTTP `POST /exec` for MCP `sandbox_exec` (`CLAWQL_SANDBOX_BRIDGE_URL`). |
| [`mcp-proxy/`](mcp-proxy/) | Optional CORS Worker in front of Node `clawql-mcp-http`. |

Pulumi loads the gateway bundle from this directory (`infra/pulumi/src/cloudflare-edge.ts`).

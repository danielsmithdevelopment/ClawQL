# ClawQL Streams — celld skeleton + clawql-core + MCP/adapter fetch (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**, with in-process **`clawql-core/streams-slim`**, optional **`fetch(CLAWQL_MCP_URL)`**, and optional **`fetch(CLAWQL_MCP_ADAPTER_URL)`**.

| DO class | Role |
| -------- | ---- |
| `GatewayDO` | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions |
| `SubscriptionDO` | Significance filter stub (`sub:{id}` naming) |
| `AgentSessionDO` | Session + WORM + audit/cache + optional MCP / adapter / inference fetches |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

## In-process vs out-of-process

| Surface | Status |
| ------- | ------ |
| `audit` (hash-chained ring) | **In-process** — `clawql-core/streams-slim` |
| `cache` (session scratch) | **In-process** — `clawql-core/streams-slim` |
| Hash-chain verify | **In-process** — via clawql-merkle (needs `nodejs_compat`) |
| Inference | **Out-of-process** — `fetch(INFERENCE_URL)` |
| `search` / `execute` / `memory_*` | **Out-of-process** — `fetch(CLAWQL_MCP_URL)` Streamable HTTP |
| `mcp-api-adapter` | **Out-of-process** — `fetch(CLAWQL_MCP_ADAPTER_URL)` REST `POST /{tool}` |

Do **not** embed `clawql-api`, `clawql-memory`, or `mcp-api-adapter` (Express/gRPC/`node:fs`).

| Env | Meaning |
| --- | ------- |
| `CLAWQL_MCP_URL` | Streamable HTTP MCP endpoint (usually `…/mcp`) |
| `CLAWQL_MCP_ADAPTER_URL` | Adapter **origin** only (e.g. `http://127.0.0.1:8090`) |
| `CLAWQL_MCP_BEARER_TOKEN` / `CLAWQL_MCP_ADAPTER_BEARER_TOKEN` | Optional Bearer |

## Prerequisites

- [celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0) on `PATH`
- [esbuild](https://esbuild.github.io/) on `PATH`
- Workspace packages built: `npm run build -w clawql-merkle -w clawql-core`

## Local dev / smoke

```bash
cd examples/streams-celld
celld dev --port 9876
# smoke (mock MCP + mock adapter):
bash scripts/smoke.sh
```

## Bundle size gate (64 MiB Workers limit)

```bash
node scripts/bundle-check.mjs
```

Typical size ≈ **0.4 MiB**. MCP + adapter clients are thin `fetch` helpers.

## Fleet deploy / Helm

Helm injects `CLAWQL_MCP_URL` + `INFERENCE_URL`. Set `streams.celld.adapterUrl` when an adapter Service is available (not charted by default). See [`deployment/samples/streams-celld/`](../../deployment/samples/streams-celld/README.md).

## Next steps

- Persist isolate audit ring beyond process memory into DO LTX storage
- Optional Workers-safe slim `clawql-api` for offline/in-cell search

# ClawQL Streams — celld skeleton + clawql-core + MCP fetch (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**, with in-process **`clawql-core/streams-slim`** and optional **`fetch(CLAWQL_MCP_URL)`** for `search` / `execute`.

| DO class | Role |
| -------- | ---- |
| `GatewayDO` | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions |
| `SubscriptionDO` | Significance filter stub (`sub:{id}` naming) |
| `AgentSessionDO` | Session + WORM row + **audit/cache** via streams-slim + optional `fetch(INFERENCE_URL)` + optional `fetch(CLAWQL_MCP_URL)` |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

## In-process vs out-of-process

| Surface | Status |
| ------- | ------ |
| `audit` (hash-chained ring) | **In-process** — `clawql-core/streams-slim` |
| `cache` (session scratch) | **In-process** — `clawql-core/streams-slim` |
| Hash-chain verify | **In-process** — via clawql-merkle (needs `nodejs_compat`) |
| Inference | **Out-of-process** — `fetch(INFERENCE_URL)` |
| `search` / `execute` | **Out-of-process** — `fetch(CLAWQL_MCP_URL)` Streamable HTTP (`tools/call`, MCP **2026-07-28** preferred) |
| `memory_ingest` / `memory_recall` | **Out-of-process** — same MCP fetch path (vault stays on the host) |
| `mcp-api-adapter` | **Deferred** — Node Express/gRPC host |

`streams-slim` **excludes** `webmcp-draft` (`node:fs`), cuckoo, Loki, and plugin dynamic loaders. Full **`clawql-api` / `clawql-memory` are not embedded** — cells call the MCP host instead.

Set `CLAWQL_MCP_URL` (and optional `CLAWQL_MCP_BEARER_TOKEN`) in Wrangler `vars` / fleet env. When unset, MCP tools return `{ deferred: true, … }`. Prefer `CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1` on clawql-mcp so POSTs return JSON (Workers still parse SSE `data:` lines).

## Prerequisites

- [celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0) on `PATH`
- [esbuild](https://esbuild.github.io/) on `PATH`
- Workspace packages built: `npm run build -w clawql-merkle -w clawql-core`

## Local dev (`celld dev`)

```bash
cd examples/streams-celld
celld dev --port 9876
```

Another terminal:

```bash
curl -s http://127.0.0.1:9876/health | jq .
curl -s -X POST http://127.0.0.1:9876/webhook/demo-lab \
  -H 'content-type: application/json' \
  -H 'x-clawql-event-id: lab-event-1' \
  -d '{"hello":"streams"}' | jq '.session.audit, .session.core, .session.tools'
```

Expect `audit.clawqlCore.ok: true`, a hash-chain `verify.ok: true`, and `core.package: "clawql-core/streams-slim"`. With `CLAWQL_MCP_URL` set, `tools.search` / `tools.execute` / `tools.memory_ingest` / `tools.memory_recall` should succeed via Streamable HTTP.

## Bundle size gate (64 MiB Workers limit)

```bash
node scripts/bundle-check.mjs
# or: clawql streams celld bundle-check --project examples/streams-celld
```

Typical size with Effect + streams-slim ≈ **0.4 MiB** (~0.6% of limit). The MCP client is a few KB of `fetch` — no SDK.

## Smoke (mock MCP)

```bash
npm run smoke -w @clawql/example-streams-celld
# or: bash examples/streams-celld/scripts/smoke.sh
```

Starts a mock Streamable HTTP MCP, runs `celld dev` with `CLAWQL_MCP_URL` pointed at it, and asserts search/execute payloads.

## Fleet deploy / Helm

Helm injects `CLAWQL_MCP_URL` (in-cluster `/mcp`) and `INFERENCE_URL` when the streams-celld overlay is enabled. See [`deployment/samples/streams-celld/`](../../deployment/samples/streams-celld/README.md) and `clawql streams celld deploy`.

## Next steps

- Optional Workers-safe slim `clawql-api` for offline/in-cell search without network
- Persist isolate audit ring beyond process memory (LTX WORM on fleet bucket already covers DO `storage.put` rows)
- Optional `mcp-api-adapter` protocol fan-out still host-side

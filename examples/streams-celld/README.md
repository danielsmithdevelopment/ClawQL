# ClawQL Streams — celld skeleton + clawql-core (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**, with in-process **`clawql-core/streams-slim`**.

| DO class | Role |
| -------- | ---- |
| `GatewayDO` | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions |
| `SubscriptionDO` | Significance filter stub (`sub:{id}` naming) |
| `AgentSessionDO` | Session + WORM row + **audit/cache** via streams-slim + optional `fetch(INFERENCE_URL)` |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

## In-process vs deferred

| Surface | Status |
| ------- | ------ |
| `audit` (hash-chained ring) | **In-process** — `clawql-core/streams-slim` |
| `cache` (session scratch) | **In-process** — `clawql-core/streams-slim` |
| Hash-chain verify | **In-process** — via clawql-merkle (needs `nodejs_compat`) |
| Inference | **Out-of-process** — `fetch(INFERENCE_URL)` |
| `search` / `execute` | **Deferred** — clawql-api stays on MCP host |
| `memory_*` | **Deferred** — clawql-memory + vault |
| `mcp-api-adapter` | **Deferred** — Node Express/gRPC host |

`streams-slim` **excludes** `webmcp-draft` (`node:fs`), cuckoo, Loki, and plugin dynamic loaders.

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
  -d '{"hello":"streams"}' | jq '.session.audit, .session.core'
```

Expect `audit.clawqlCore.ok: true`, a hash-chain `verify.ok: true`, and `core.package: "clawql-core/streams-slim"`.

## Bundle size gate (64 MiB Workers limit)

```bash
node scripts/bundle-check.mjs
# or: clawql streams celld bundle-check --project examples/streams-celld
```

Typical size with Effect + streams-slim ≈ **0.4 MiB** (~0.6% of limit).

## Fleet deploy / Helm

Same as before — see [`deployment/samples/streams-celld/`](../../deployment/samples/streams-celld/README.md) and `clawql streams celld deploy`.

## Next steps

- Slim `clawql-api` Workers surface for true in-cell `search`/`execute`, or `fetch` to in-cluster MCP
- Persist audit beyond isolate memory (LTX WORM on fleet bucket already covers DO `storage.put` rows)

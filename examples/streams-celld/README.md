# ClawQL Streams — celld skeleton + clawql-core + MCP/adapter fetch (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**, with in-process **`clawql-core/streams-slim`**, optional **`fetch(CLAWQL_MCP_URL)`**, and optional **`fetch(CLAWQL_MCP_ADAPTER_URL)`**.

| DO class         | Role                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `GatewayDO`      | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions        |
| `SubscriptionDO` | Significance filter stub (`sub:{id}` naming)                              |
| `AgentSessionDO` | Session + WORM + audit/cache + optional MCP / adapter / inference fetches |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)  
**Evidence matrix:** [`docs/streams/streams-celld-evidence.md`](../../docs/streams/streams-celld-evidence.md)

## Why slim in the cell — and how we still demo the full product

celld/Workers cannot host Express, gRPC, stdio MCP, or `node:fs` vault IO. Putting “full core” / `mcp-api-adapter` **inside** the isolate is the wrong demo.

The right demo is the **production shape**: slim cell + real sidecars.

| Mode                 | What runs                                                                                   | Command                                                |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Contract smoke       | celld + **mock** MCP + **mock** adapter                                                     | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke`         |
| **Full-stack smoke** | celld + **real** `clawql-mcp-http` + **real** `mcp-api-adapter` + inference `/healthz` stub | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:full`    |
| Containers           | MCP + adapter images (celld on host)                                                        | `docker compose -f docker-compose.full.yml up --build` |

## In-process vs out-of-process

| Surface                           | Status                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `audit` (hash-chained ring)       | **In-process** + **LTX flush** — streams-slim ring; snapshot `audit:ring` + `audit:seq:*` |
| `cache` (session scratch)         | **In-process** — `clawql-core/streams-slim`                                               |
| Hash-chain verify                 | **In-process** — via clawql-merkle (needs `nodejs_compat`)                                |
| Inference                         | **Out-of-process** — `fetch(INFERENCE_URL)`                                               |
| `search` / `execute` / `memory_*` | **Out-of-process** — `fetch(CLAWQL_MCP_URL)` Streamable HTTP                              |
| `mcp-api-adapter`                 | **Out-of-process** — `fetch(CLAWQL_MCP_ADAPTER_URL)` REST `POST /{tool}`                  |

Do **not** embed `clawql-api`, `clawql-memory`, or `mcp-api-adapter` (Express/gRPC/`node:fs`).

| Env                                                           | Meaning                                                |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `CLAWQL_MCP_URL`                                              | Streamable HTTP MCP endpoint (usually `…/mcp`)         |
| `CLAWQL_MCP_ADAPTER_URL`                                      | Adapter **origin** only (e.g. `http://127.0.0.1:8090`) |
| `CLAWQL_MCP_BEARER_TOKEN` / `CLAWQL_MCP_ADAPTER_BEARER_TOKEN` | Optional Bearer                                        |

MCP protocol header from the cell client is **`2025-11-25`** (SDK allow-list). Point cells at a clawql-mcp with **`CLAWQL_MCP_STATELESS=1`** (or send `mcp-protocol-version: 2026-07-28` once the SDK allow-list includes it) so tools/call does not require session affinity.

## Evidence — what proves it works

| Check                                   | Command                                                        | Automated in CI?                           |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| streams-slim unit                       | `npx vitest run packages/clawql-core/src/streams-slim.test.ts` | **Yes**                                    |
| MCP fetch unit                          | `npm run test:mcp-fetch`                                       | **Yes**                                    |
| Adapter fetch unit                      | `npm run test:adapter-fetch`                                   | **Yes**                                    |
| Bundle ≤ 64 MiB                         | `npm run bundle-check`                                         | **Yes**                                    |
| Helm celld templates                    | `make helm-celld-template-tests`                               | **Yes** (via `lint-k8s-manifests`)         |
| Local E2E smoke (mocks)                 | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke`                 | **Yes** when celld installs                |
| **Full-stack E2E** (real MCP + adapter) | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:full`            | **Yes** — job **Streams celld full-stack** |
| Fleet / cluster webhook                 | sample pack README                                             | **Manual** (templates only in CI)          |

## Prerequisites

- [celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0) on `PATH` (for smoke / `celld dev`)
- [esbuild](https://esbuild.github.io/) on `PATH`
- Workspace packages built: `npm run build -w clawql-merkle -w clawql-core` (full-stack also needs root `npm run build` + `mcp-api-adapter`)

## Local dev / smoke

```bash
cd examples/streams-celld
celld dev --port 9876
# contract smoke (mock MCP + mock adapter):
STREAMS_CELLD_SMOKE_REQUIRED=1 bash scripts/smoke.sh
# full product smoke (real clawql-mcp + real mcp-api-adapter):
STREAMS_CELLD_SMOKE_REQUIRED=1 bash scripts/full-stack-smoke.sh
```

Without `STREAMS_CELLD_SMOKE_REQUIRED=1`, a missing `celld` binary **skips** with exit 0 (local convenience only).

## Bundle size gate (64 MiB Workers limit)

```bash
node scripts/bundle-check.mjs
```

Typical size ≈ **0.4 MiB**. MCP + adapter clients are thin `fetch` helpers.

## Fleet deploy / Helm

Helm injects `CLAWQL_MCP_URL` + `INFERENCE_URL`. Set `streams.celld.adapterUrl` when an adapter Service is available (not charted by default). See [`deployment/samples/streams-celld/`](../../deployment/samples/streams-celld/README.md).

## Next steps

- Optional Workers-safe slim `clawql-api` for offline/in-cell search
- Optional Helm chart Service for mcp-api-adapter (cells already accept `adapterUrl`)
- Automated cluster webhook E2E (today: Helm template assertions only)

# ClawQL Streams — celld skeleton + clawql-core + MCP/adapter fetch (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**, with in-process **`clawql-core/streams-slim`**, optional **`fetch(CLAWQL_MCP_URL)`**, and optional **`fetch(CLAWQL_MCP_ADAPTER_URL)`**.

| DO class         | Role                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| `GatewayDO`      | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions                      |
| `SubscriptionDO` | Significance filter (`always`/`never`/`threshold`/`pattern`/`rate`/`composite`; `sub:{id}`) |
| `AgentSessionDO` | Session + TTL `setAlarm` + ring/LTX + optional MCP / adapter / one-turn inference / host WORM |
| `CoreToolsDO`    | **Default** in-isolate slim Core `search`/`execute` (`POST /mcp`; escape → Bun host MCP) |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)  
**Evidence matrix:** [`docs/streams/streams-celld-evidence.md`](../../streams/streams-celld-evidence.md)

## Why slim in the cell — and how we still demo the full product

celld/Workers cannot host Express, gRPC, stdio MCP, or `node:fs` vault IO. Putting “full core” / `mcp-api-adapter` **inside** the isolate is the wrong demo.

The right demo is the **production shape**: slim cell + real sidecars.

| Mode                 | What runs                                                                                   | Command                                                |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Contract smoke       | celld + **mock** MCP + **mock** adapter                                                     | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke`         |
| **Core in celld**    | celld `CoreToolsDO` handles `search`/`execute` (no host MCP) + mock pets upstream           | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:core-in-celld` |
| **Full-stack smoke** | celld + **real** `clawql-mcp-http` + **real** `mcp-api-adapter` + inference one-turn stub | `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:full`    |
| Containers           | MCP + adapter images (celld on host)                                                        | `docker compose -f docker-compose.full.yml up --build` |

## In-process vs out-of-process

| Surface                            | Status                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `audit` ring (session bookkeeping) | **In-process** + **LTX flush** — not compliance; snapshot `audit:ring` + `audit:seq:*` |
| Host `clawql-audit` (compliance)   | **Out-of-process** — `fetch(CLAWQL_AUDIT_WORM_URL)` → tip-loaded `WORMAuditTrail`      |
| `cache` (session scratch)          | **In-process** — `clawql-core/streams-slim`                                            |
| Hash-chain verify                  | **In-process** — via clawql-merkle (needs `nodejs_compat`)                             |
| Inference (one-turn)               | **Out-of-process** — `fetch(INFERENCE_URL)` `/healthz` + `POST /v1/messages`           |
| `search` / `execute` (slim)        | **In-process default** — `CoreToolsDO` (`CLAWQL_CORE_IN_CELLD=0` → Bun host MCP)       |
| `memory_*` (and host escape Core)  | **Out-of-process** — `fetch(CLAWQL_MCP_URL)` Streamable HTTP (Bun host / full Core)    |
| `mcp-api-adapter`                  | **Out-of-process** — `fetch(CLAWQL_MCP_ADAPTER_URL)` REST `POST /{tool}`               |

Do **not** embed `clawql-api`, `clawql-memory`, or `mcp-api-adapter` (Express/gRPC/`node:fs`).

| Env                                                           | Meaning                                                |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `CLAWQL_MCP_URL`                                              | Streamable HTTP MCP endpoint (usually `…/mcp`)         |
| `CLAWQL_MCP_ADAPTER_URL`                                      | Adapter **origin** only (e.g. `http://127.0.0.1:8090`) |
| `CLAWQL_MCP_BEARER_TOKEN` / `CLAWQL_MCP_ADAPTER_BEARER_TOKEN` | Optional Bearer                                        |
| `CLAWQL_CORE_IN_CELLD`                                        | Default `1`; set `0` / `CLAWQL_DECLINE_CELLD=1` to skip celld → Bun ladder |
| `CLAWQL_DECLINE_BUN`                                          | Skip Bun → Node (legacy) with improve-performance message         |
| `CLAWQL_CORE_UPSTREAM`                                        | REST origin for in-cell `execute` (e.g. mock `/pets`)  |
| `CLAWQL_AUDIT_WORM_URL`                                       | Host `clawql-audit` HTTP origin (`POST /entries`)      |
| `CLAWQL_AUDIT_API_KEY`                                        | ApiKey for host WORM HTTP (optional if open)           |

**Point any MCP client at celld for Core tools:** `POST http://127.0.0.1:<port>/mcp` (Streamable HTTP). Responses stamp `transport: "celld-isolate"`. This is the slim catalog (pets + Streams noop), not full production Core — see honesty string on every payload.

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
cd docs/examples/streams-celld
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

Helm injects `CLAWQL_MCP_URL` + `INFERENCE_URL`. Set `streams.celld.adapterUrl` when an adapter Service is available (not charted by default). See [`docs/examples/idp/streams-celld/`](../idp/streams-celld/README.md).

## Next steps

- Optional Workers-safe slim `clawql-api` for offline/in-cell search
- Optional Helm chart Service for mcp-api-adapter (cells already accept `adapterUrl`)
- Automated cluster webhook E2E (today: Helm template assertions only)

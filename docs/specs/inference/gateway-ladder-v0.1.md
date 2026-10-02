# Inference gateway ladder — `/v1` → `/mcp` → `/memory` → `/decision` → `/events` (8.0.0)

**Status:** locked for 8.0.0 ship  
**Package:** `clawql-inference` (+ managed-gateway proxy)  
**Related:** [[Inference gateway GTM ladder]] vault note · Fast Decision closeouts · Unified Capability Lifecycle · [[MCP Events in 8.0.0]]

## Ladder

| Rung | Surface                 | Client switch                           |
| ---- | ----------------------- | --------------------------------------- |
| 1    | `/v1` OpenAI-compatible | `OPENAI_BASE_URL=…/v1`                  |
| 2    | `/mcp`                  | same host `/mcp` (proxy → MCP upstream) |
| 3    | `/memory`               | REST + opt-in chat enrichment           |
| 4    | `/decision`             | canonical; `/v1/systemone` alias        |
| 5    | `/events`               | REST façade over MCP Events             |

Shared virtual key, budgets, WORM/audit identity across rungs.

## `/decision`

- **Canonical:** `POST /decision`
- **Alias:** `POST /v1/systemone` (TypeSafe / Ollama / OpenRouter System One wire shape)
- **Request:** System One `state` + `questions` (`choice` | `noul`; `score` deferred) **plus** ClawQL: `useSiteId`, and `escalation` (`mode`: `abstain` | `escalate`, optional `model`)
- **Response:** decisions with per-option probabilities, `calibrated`, `abstained`, `escalated`, `backendId`, `traceId`
- **Lifecycle:** exploratory sites escalate by default and never label scores as calibrated confidence. Only `search_provider_tool_routing` ships `productionTrusted` at 8.0.0 (GLiNER Decide path). Trust does not transfer across backends.
- **Honesty:** stub / uncalibrated backends → `calibrated: false`; never invent confidence meaning.

## `/memory`

| Mode       | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST       | `POST /memory/ingest`, `POST /memory/search`, `GET /memory`, `GET /memory/:slug`, `DELETE /memory/:slug` (erasure) — thin façade over `clawql-memory`                                                                                                                                                                                                                                                                                                                                                           |
| Enrichment | Opt-in. **Virtual-key policy outranks** `x-clawql-memory-enrich` / `CLAWQL_INFERENCE_MEMORY_ENRICH`: the header only works when the key has `memoryEnrichment: true`. Enrichment reads only `Memory/<scope>/` (`memoryScope` or `team`). Response `x-clawql-memory-ids` lists injected paths; WORM audit records those IDs + scope (never body text) for the Evidence tab. **Default off.** Store down → forward without memory. Screen/redact fail → **fail closed**. Capture from traffic **off by default**. |
| Erasure    | Full purge + crypto-shred + opaque WORM `pathId` + export deny-list — see [Erasure](#erasure) below                                                                                                                                                                                                                                                                                                                                                                                                             |
| MCP        | Existing `memory_recall` / `memory_ingest` via `/mcp`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Erasure

`DELETE /memory/:slug` (and `clawql-memory` erase) is built for **git-native vaults** where deleting the working-tree file is not enough — history and R2 mirrors would otherwise retain plaintext forever.

| Concern                | Approach                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working tree + indexes | Delete the note and purge `memory.db`, pgvector, and `ontology.db` rows for that path                                                                                                                                                                                                                                                                                                                     |
| Git history / R2       | **Crypto-shredding** (default when `CLAWQL_MEMORY_BACKEND=git`): each Memory note is AES-256-GCM encrypted with a per-note key under `.clawql/note-keys/` (gitignored). Erase destroys the key so ciphertext in commits and remote mirrors becomes permanently unreadable. Prefer this over `git filter-repo` rewrite (heavy; breaks other clones). Opt out with `CLAWQL_MEMORY_CRYPTO_SHRED=0`           |
| WORM / Evidence        | Append `MEMORY_RETRACTED` with opaque **`pathId`** + content hash only — never the readable path (slugs can be PII) and never the body. Readable path ↔ `pathId` lives in erasable `.clawql/path-map.json`                                                                                                                                                                                                |
| Training exports       | Erased content hashes append to `.clawql/erasure-deny.json`. `clawql inference export` skips matching message/response hashes so erased content never reappears in a future training set. Historical export files on operator disk remain **out of band**; lineage records show which past exports / fine-tuned models included the content so those can be regenerated if an erasure request requires it |

## `/decision` System One

- Supported question types: `choice`, `noul`
- `score` → **400** with an explicit “not supported yet” message on both `/decision` and `/v1/systemone` (no silent failure)

## `/events`

REST façade over **`clawql-mcp-events`** — same live catalog, subscription store, Standard Webhooks delivery, and enterprise controls as MCP JSON-RPC `events/list|subscribe|unsubscribe` on `/mcp`. One store; no second event system.

| Method | Path                        | Behavior                                                              |
| ------ | --------------------------- | --------------------------------------------------------------------- |
| `GET`  | `/events`                   | Discovery (`object: clawql.events`, enabled flag)                     |
| `GET`  | `/events/list`              | Event catalog (`cursor` query); same payload as `events/list`         |
| `POST` | `/events/subscribe`         | Webhook subscribe (`name`, `arguments`, `delivery`, optional `ttlMs`) |
| `POST` | `/events/unsubscribe`       | Webhook unsubscribe (match `name` + `delivery.url`)                   |
| `GET`  | `/events/subscriptions/:id` | Subscription metadata (no secret); principal-scoped                   |

- **Principal:** virtual-key id when keys are enforced; else `x-clawql-principal` or `anonymous` (matches MCP host).
- **Disable:** `CLAWQL_ENABLE_MCP_EVENTS=0` → REST returns **503** (same flag as MCP Discover `capabilities.events`).
- **ChatGPT / MCP clients** keep using JSON-RPC on `/mcp`; HTTP clients and scripts use `/events`.
- Spec detail: [`docs/specs/mcp/mcp-events-v0.1.md`](../mcp/mcp-events-v0.1.md).

## `/mcp`

Remains the MCP HTTP process. Managed-gateway proxy routes `/mcp` → MCP upstream and `/v1`, `/memory`, `/decision`, `/events` → inference. Same public host = one-line GTM story.

## Out of scope for first cut

- Default-on enrichment (needs MaxP-style A/B)
- Auto-capture of facts from chat traffic
- `score` System One questions (calibrate levels before averaging)
- Promoting Nimble / Tev1 / Jev as trusted backends (candidates only via future eval)
- In-process MCP inside the inference Express app
- Full `clawql-streams` / `stream_subscribe` agent wake loop (change-detection → `stream.changed` already ships)

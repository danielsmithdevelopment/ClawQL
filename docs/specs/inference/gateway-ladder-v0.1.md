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
| 5    | `/events`               | HTTP door into MCP Events (not a twin)  |

Shared virtual key, budgets, WORM/audit identity across rungs.

## `/decision`

- **Canonical:** `POST /decision`
- **Alias:** `POST /v1/systemone` (TypeSafe / Ollama / OpenRouter System One wire shape)
- **Request:** System One `state` + `questions` (`choice` | `noul` | `score`) **plus** ClawQL: `useSiteId`, and `escalation` (`mode`: `abstain` | `escalate`, optional `model`)
- **OpenAI-compatible:** `POST /v1/decisions` — see [openai-decisions-compat-v0.1.md](./openai-decisions-compat-v0.1.md)
- **Response:** decisions with per-option probabilities (and `score` weighted level index), `calibrated`, `abstained`, `escalated`, `backendId`, `traceId`
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

- Supported question types: `choice`, `noul` (alias `predicate`), `score`
- `score` returns a probability-weighted average of ordered level indices (OpenAI Decisions parity)
- SDK drop-in: `POST /v1/decisions` with OpenAI request/response shapes + ClawQL trust fields

## `/events`

HTTP door into **`clawql-mcp-events`** — same live catalog (seven types), subscription store, Standard Webhooks delivery, callback allowlist, redaction, per-user caps, access rechecks, loop detection, and WORM as MCP JSON-RPC `events/list|subscribe|unsubscribe` on `/mcp`. **Not a second event system.**

**Locked 8.0.0 names** (singular actions `/decision` `/memory`; plural collections `/events`):

| Method   | Path                        | Behavior                                                                                          |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET`    | `/events`                   | Discovery (`object: clawql.events`, enabled flag)                                                 |
| `GET`    | `/events/catalog`           | Seven event types + schemas — same payload as MCP `events/list`                                   |
| `GET`    | `/events/subscriptions`     | Principal-scoped webhook subscriptions (no secrets)                                               |
| `POST`   | `/events/subscriptions`     | Webhook subscribe (`name`, `arguments`, `delivery`, optional `ttlMs`) + callback challenge        |
| `DELETE` | `/events/subscriptions/:id` | Unsubscribe by id                                                                                 |
| `GET`    | `/events/stream`            | SSE CloudEvents 1.0; resume with `Last-Event-ID` (JetStream sequence in production)               |
| `POST`   | `/events/inbound/{source}`  | Verify GitHub / Stripe / Figma signatures; emit untrusted `stream.changed` `topic: inbound:{src}` |

**Aliases** (keep working; do not advertise as canonical): `GET /events/list`, `POST /events/subscribe`, `POST /events/unsubscribe`, `GET /events/subscriptions/:id`.

- **Principal:** virtual-key id when keys are enforced; else `x-clawql-principal` or `anonymous` (matches MCP host).
- **Inbound auth:** provider signatures, not virtual keys. Screened, labeled `untrusted: true` and `source: "inbound:{provider}"` (e.g. `inbound:github`), never read as instructions. Maps onto existing `stream.changed` — **no eighth catalog type**.
- **Inbound opt-in:** existing `stream.changed` subscribers (projection / `watch_fields`) **do not** receive inbound webhooks by default. Automations must set `arguments.source` to `inbound:github` / `inbound:stripe` / `inbound:figma` / `inbound:*` (and usually `topic` to the same inbound label). Topic-only subscriptions never get inbound traffic, even if the topic string collides.
- **Envelope:** SSE and optional NATS publish use **CloudEvents 1.0** (`type: com.clawql.<name>`). ChatGPT / MCP webhook bodies stay `{eventId,name,timestamp,data,cursor}` with Standard Webhooks (`webhook-id` = event id).
- **Disable:** `CLAWQL_ENABLE_MCP_EVENTS=0` → REST returns **503** (same flag as MCP Discover `capabilities.events`).
- **Parity:** a subscription created on `/mcp` appears under `GET /events/subscriptions`; one created on `/events` is visible to MCP `events/list` (catalog) and the shared store; both receive identical signed webhook deliveries.
- Spec detail: [`docs/specs/mcp/mcp-events-v0.1.md`](../mcp/mcp-events-v0.1.md).

### NATS JetStream (internal backbone)

Producers publish **once** to JetStream (`clawql.events.<type>.<tenant>`). Webhook delivery, SSE fan-out, and MCP Events are consumers of that stream. `Last-Event-ID` maps to the JetStream sequence; `Nats-Msg-Id` = event id (dedup window + Standard Webhooks retries). CloudEvents travels unchanged (official NATS binding).

**Do not expose NATS to customers.** `/events` is the governed edge (auth, scopes, caps, redaction, access rechecks). Redact **before publish** — JetStream persists messages. Include event streams in the erase path and set retention limits. In-process ring buffer (default 1024) is the **single-process** stand-in only.

#### Managed / multi-replica release requirement (`cloud.clawql.com`)

Wiring `EventStreamPublisher` to JetStream is **required** before managed launch (env `CLAWQL_EVENTS_REQUIRE_JETSTREAM=1` or `CLAWQL_CONSOLE_SURFACE=managed`). Without it:

- An SSE client that reconnects to a **different replica** cannot resume from `Last-Event-ID` (each process has its own ring buffer).
- Each replica may run webhook delivery and send **duplicate** signed webhooks for the same event.

**Release bar:** host provides `eventStreamPublisher`; webhook delivery workers join JetStream queue group `clawql-events-webhook` so each event is delivered **exactly once** across replicas; SSE resume reads the shared JetStream sequence (not the local buffer). `makeMcpEventsService` fail-closes when JetStream is required and the publisher is missing.

## `/mcp`

Remains the MCP HTTP process. Managed-gateway proxy routes `/mcp` → MCP upstream and `/v1`, `/memory`, `/decision`, `/events` → inference. Same public host = one-line GTM story.

## Out of scope for first cut

- Default-on enrichment (needs MaxP-style A/B)
- Auto-capture of facts from chat traffic
- Multi-backend fan-out evaluation **disagreement_mining / live ensembles** (bulk ships — [decisions-fanout-eval-v0.1](./decisions-fanout-eval-v0.1.md))
- Flip-rate perturbation gate before `productionTrusted`
- Promoting Nimble / Tev1 / Jev / Microsoft-Decision-1 as trusted backends (candidates via held-out / fan-out)
- In-process MCP inside the inference Express app
- Full `clawql-streams` / `stream_subscribe` agent wake loop (change-detection → `stream.changed` already ships)
- Exposing NATS / JetStream to customers (leaf nodes stay on the fabric, behind `/events`)

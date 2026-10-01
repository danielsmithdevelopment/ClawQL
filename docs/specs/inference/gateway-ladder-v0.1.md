# Inference gateway ladder — `/v1` → `/mcp` → `/memory` → `/decision` (8.0.0)

**Status:** locked for 8.0.0 ship  
**Package:** `clawql-inference` (+ managed-gateway proxy)  
**Related:** [[Inference gateway GTM ladder]] vault note · Fast Decision closeouts · Unified Capability Lifecycle

## Ladder

| Rung | Surface                 | Client switch                           |
| ---- | ----------------------- | --------------------------------------- |
| 1    | `/v1` OpenAI-compatible | `OPENAI_BASE_URL=…/v1`                  |
| 2    | `/mcp`                  | same host `/mcp` (proxy → MCP upstream) |
| 3    | `/memory`               | REST + opt-in chat enrichment           |
| 4    | `/decision`             | canonical; `/v1/systemone` alias        |

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
| Erasure    | `DELETE /memory/:slug` removes the vault note **and** derived copies in `memory.db`, pgvector, and `ontology.db`, then **crypto-shreds** the per-note key (`.clawql/note-keys/`, gitignored) so git history / R2 mirrors retain ciphertext only. WORM appends `MEMORY_RETRACTED` with opaque `pathId` + content hash only (never readable path or body — path map in `.clawql/path-map.json` is erasable). Erased content hashes are appended to `.clawql/erasure-deny.json`; export jobs skip matching hashes so erased content never reappears in a future training set. Historical training export files on operator disk remain out of band; lineage records show which past exports / fine-tuned models included the content so those can be regenerated if required. |
| MCP        | Existing `memory_recall` / `memory_ingest` via `/mcp`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## `/decision` System One

- Supported question types: `choice`, `noul`
- `score` → **400** with an explicit “not supported yet” message on both `/decision` and `/v1/systemone` (no silent failure)

## `/mcp`

Remains the MCP HTTP process. Managed-gateway proxy routes `/mcp` → MCP upstream and `/v1`, `/memory`, `/decision` → inference. Same public host = one-line GTM story.

## Out of scope for first cut

- Default-on enrichment (needs MaxP-style A/B)
- Auto-capture of facts from chat traffic
- `score` System One questions (calibrate levels before averaging)
- Promoting Nimble / Tev1 / Jev as trusted backends (candidates only via future eval)
- In-process MCP inside the inference Express app

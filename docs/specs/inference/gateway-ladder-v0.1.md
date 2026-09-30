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

| Mode       | Behavior                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REST       | `POST /memory/ingest`, `POST /memory/search`, `GET /memory`, `GET /memory/:slug`, `DELETE /memory/:slug` (erasure) — thin façade over `clawql-memory`                                                                                                                                                                          |
| Enrichment | Opt-in per virtual key env / `x-clawql-memory-enrich: 1` on `/v1/chat/completions`. Selective inject into a marked system block; response headers list memory IDs. **Default off.** Store down → forward without memory. Screen/redact fail → **fail closed** (no unscreened inject). Capture from traffic **off by default**. |
| MCP        | Existing `memory_recall` / `memory_ingest` via `/mcp`                                                                                                                                                                                                                                                                          |

## `/mcp`

Remains the MCP HTTP process. Managed-gateway proxy routes `/mcp` → MCP upstream and `/v1`, `/memory`, `/decision` → inference. Same public host = one-line GTM story.

## Out of scope for first cut

- Default-on enrichment (needs MaxP-style A/B)
- Auto-capture of facts from chat traffic
- `score` System One questions (calibrate levels before averaging)
- Promoting Nimble / Tev1 / Jev as trusted backends (candidates only via future eval)
- In-process MCP inside the inference Express app

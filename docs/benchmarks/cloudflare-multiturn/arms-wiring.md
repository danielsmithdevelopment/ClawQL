# Arms wiring plan

All arms use **Streamable HTTP**. Full Cloudflare v4 (~2.9k ops in repo OpenAPI) vs **curated subset** ([`curated-subset.json`](./curated-subset.json)).

| Arm | Catalog | Adapter status | Notes |
| --- | --- | --- | --- |
| `direct` | curated (implicit) | **Wired** | Raw REST to replay mock |
| `clawql_default` | curated OAS | **Wired** | `CLAWQL_SEARCH_COMPACT=0`; observation-shaped `where` |
| `clawql_compact_search` | curated OAS | **Wired** | `CLAWQL_SEARCH_COMPACT=1` (labeled setting) |
| `clawql_known_op` | curated OAS | **Wired** | Execute by operationId; no search; same `where` |
| `clawql_routed` | curated OAS | **Planned** | Execute-by-description + GLiNER2-Decide (server-side); see SPEC § Next lever; prove beside known-op + default |
| `clawql_program` | curated OAS | **Wired** | `CLAWQL_ENABLE_PROGRAMS=1`; one `execute_program` JSON plan (ADR 0015 v0); not free-form JS |
| `cloudflare_codemode` | full (2-tool) | **Tokens-only (scripted board)** | Def≈1000 from CF docs; result tokens from fixture; latency N/A. **Out of real-model gate** (hosted → live API / write risk). |
| `executor_v2` | code + OpenAPI app | **Wired** | `liveOpenapiRouter` → mock; scripts call `tools["cf-zone-audit-mock"].…`; **in real-model gate** |

**ClawQL default product behavior on the board:** observation budget on (`~8k` chars when no `where`/`fields`); scripted shapes always pass `where`, so publish rows stay observation-sized.

| `mcpjungle` | curated only | **Wired** | REST→MCP child (`cf-rest-mcp.mjs`); tree RSS+anon |
| `agentgateway` | curated only | **Wired** | Same REST→MCP child |

Shapes: [`lib/clawql-shapes.mjs`](../../scripts/benchmarks/cloudflare-multiturn/lib/clawql-shapes.mjs).

**Publish gate:** `CF_MT_ITERS≥10000` and `CF_MT_REPS≥3` → `board-*`. Otherwise `smoke-*`.

```bash
export EXECUTOR_BIN=/tmp/executor-v2/node_modules/.bin/executor
export EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)"
CF_MT_ITERS=10000 CF_MT_REPS=3 npm run benchmark:cloudflare-multiturn:board
```

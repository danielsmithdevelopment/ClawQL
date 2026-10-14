# Arms wiring plan

All arms use **Streamable HTTP**. Full Cloudflare v4 (~2.9k ops in repo OpenAPI) vs **curated subset** ([`curated-subset.json`](./curated-subset.json)).

| Arm | Catalog | Adapter status | Notes |
| --- | --- | --- | --- |
| `direct` | curated (implicit) | **Wired** | Raw REST to replay mock |
| `clawql_default` | curated OAS | **Wired** | `CLAWQL_SEARCH_COMPACT=0` (labeled) |
| `clawql_compact_search` | curated OAS | **Wired** | `CLAWQL_SEARCH_COMPACT=1` (labeled setting) |
| `clawql_known_op` | curated OAS | **Wired** | Execute by operationId; no search |
| `cloudflare_codemode` | full (2-tool) | **Tokens-only** | Def≈1000 from CF docs; result tokens from fixture returns; latency N/A |
| `executor_v2` | code + OpenAPI app | **Wired** | `ensure-executor-openapi-app.mjs` deploys `liveOpenapiRouter` → mock; scripts call `tools["cf-zone-audit-mock"].…` |
| `mcpjungle` | curated only | **Wired** | REST→MCP child (`cf-rest-mcp.mjs`); tree RSS+anon |
| `agentgateway` | curated only | **Wired** | Same REST→MCP child |

**Publish gate:** `CF_MT_ITERS≥10000` and `CF_MT_REPS≥3` → `board-*`. Otherwise `smoke-*`.

```bash
export EXECUTOR_BIN=/tmp/executor-v2/node_modules/.bin/executor
export EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)"
CF_MT_ITERS=10000 CF_MT_REPS=3 npm run benchmark:cloudflare-multiturn:board
```

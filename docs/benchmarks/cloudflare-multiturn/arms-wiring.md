# Arms wiring plan

All arms use **Streamable HTTP**. Full Cloudflare v4 (~2.9k ops in repo OpenAPI) vs **curated subset** ([`curated-subset.json`](./curated-subset.json)).

| Arm | Catalog | Adapter status | Notes |
| --- | --- | --- | --- |
| `direct` | curated (implicit) | **Wired** | Raw REST to replay mock |
| `clawql_default` | curated OAS via ClawQL | **Wired** | Streamable HTTP, SQLite catalog on, search→execute |
| `clawql_known_op` | curated OAS via ClawQL | **Wired** | Execute by operationId; no search on steady-state turns |
| `cloudflare_codemode` | full (2-tool) | **Tokens-only** | Self-host [cloudflare/mcp](https://github.com/cloudflare/mcp) still open; published scripts counted |
| `executor_v2` | code | **Wired (static_upstream0)** | QuickJS has no `fetch`; compact fixture slices inlined (`executorV2ScriptsFromWorld`); pin `executor@2.0.0-beta.15` |
| `mcpjungle` | curated only | **Wired** | REST-to-MCP child (`cf-rest-mcp.mjs`); tree RSS+anon |
| `agentgateway` | curated only | **Wired** | Same REST-to-MCP child as MCPJungle |

**Full-spec feasibility row:** MCPJungle / agentgateway mark **N/A — context overflow** (~1.17M tokens native / ~244k required-only) rather than a failed run.

**Interleaved board:** `run-board.mjs` starts mock + each gateway, rotates arms within each rep.

```bash
CF_MT_ITERS=20 CF_MT_REPS=1 \
  EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)" \
  npm run benchmark:cloudflare-multiturn:board
```

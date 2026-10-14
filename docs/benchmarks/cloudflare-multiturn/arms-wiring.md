# Arms wiring plan

All arms use **Streamable HTTP**. Full Cloudflare v4 (~2.9k ops in repo OpenAPI) vs **curated subset** ([`curated-subset.json`](./curated-subset.json)).

| Arm | Catalog | Adapter status | Notes |
| --- | --- | --- | --- |
| `direct` | curated (implicit) | **Smoke done** | Raw REST to replay mock |
| `clawql_default` | full + curated | Next | Bun/Node HTTP, SQLite catalog on, search→execute |
| `clawql_known_op` | full + curated | Next | Execute by operationId; no search on steady-state turns |
| `cloudflare_codemode` | full (2-tool) | Next | Self-host [cloudflare/mcp](https://github.com/cloudflare/mcp) if possible; else tokens-only |
| `executor_v2` | code | Next | Published scripts in `code-mode/published-scripts.mjs`; pin beta version |
| `mcpjungle` | curated only | Next | Same REST-to-MCP child as agentgateway; tree RSS+anon |
| `agentgateway` | curated only | Next | Same REST-to-MCP child |

**Full-spec feasibility row:** MCPJungle / agentgateway mark **N/A — context overflow** (~1.17M tokens native / ~244k required-only) rather than a failed run.

**Interleaved board:** extend `run-zone-audit.mjs` (or a sibling `run-board.mjs`) to start each gateway, pin cores like `gateway-multi-multiturn.mjs`, and rotate arms within each of 3 runs × 10k sessions.

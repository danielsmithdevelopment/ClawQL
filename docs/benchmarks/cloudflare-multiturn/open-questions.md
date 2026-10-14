# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or stay **tokens-only** (no latency/memory)?
- [ ] **Account sparsity / live recording:** Live fixture + recorded-latency board still open. Synthetic DNS is already scaled to 300.
- [ ] **Real-model pin:** Which model + settings for the 50-session validation (same for every arm)?
- [x] **REST-to-MCP for aggregators:** `lib/cf-rest-mcp.mjs` — same child for MCPJungle and agentgateway.
- [x] **Executor real tool path:** Curated OAS registered via `liveOpenapiRouter` pointing at the mock (`ensure-executor-openapi-app.mjs`). Sandbox calls tools; host performs HTTP. Static fixture inlining removed.
- [x] **Compact search as labeled setting:** `clawql_compact_search` arm with `CLAWQL_SEARCH_COMPACT=1`. Default row keeps compact off until routing eval clears it as product default.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog can load full `providers/cloudflare/openapi.yaml` under Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers before publication.

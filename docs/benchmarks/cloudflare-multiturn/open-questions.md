# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or is that arm **tokens-only** (no latency/memory)?
- [ ] **Account sparsity:** How sparse is the test account? Will the published board need **scaled DNS** (`lib/scale-dns.mjs`) and the label “real schemas, scaled content”? Keep an unscaled companion run either way.
- [ ] **Real-model pin:** Which model + settings for the 50-session validation (same for every arm)?
- [ ] **REST-to-MCP for aggregators:** Which REST-to-MCP server do MCPJungle and agentgateway front for the curated subset (same binary for both)?
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog + Bun HTTP can load `providers/cloudflare/openapi.yaml` (~3k ops) under the isolated layout within Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers to submit config fixes before publication; document cutoff date.

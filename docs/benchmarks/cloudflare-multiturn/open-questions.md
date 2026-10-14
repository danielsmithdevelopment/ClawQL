# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or is that arm **tokens-only** (no latency/memory)? *Current board: tokens-only.*
- [ ] **Account sparsity:** How sparse is the test account? Will the published board need **scaled DNS** (`lib/scale-dns.mjs`) and the label “real schemas, scaled content”? Keep an unscaled companion run either way. *Synthetic fixture already scales DNS to 300.*
- [ ] **Real-model pin:** Which model + settings for the 50-session validation (same for every arm)?
- [x] **REST-to-MCP for aggregators:** `scripts/benchmarks/cloudflare-multiturn/lib/cf-rest-mcp.mjs` — same child for MCPJungle and agentgateway.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog + Bun HTTP can load `providers/cloudflare/openapi.yaml` (~3k ops) under the isolated layout within Ready memory budget. *Board today uses curated OAS (~60 ops).*
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers to submit config fixes before publication; document cutoff date.
- [x] **Executor sandbox fetch:** Confirmed absent in `executor@2.0.0-beta.15` QuickJS; arm uses static_upstream0 fixture slices (`executorV2ScriptsFromWorld`).

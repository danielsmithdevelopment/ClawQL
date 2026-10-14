# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or stay **tokens-only** (no latency/memory)?
- [ ] **Account sparsity / live recording:** Live fixture + recorded-latency board still open. Synthetic DNS is already scaled to 300.
- [ ] **Real-model pin:** Which model + settings for the 50-session validation (same for every arm)?
- [x] **REST-to-MCP for aggregators:** `lib/cf-rest-mcp.mjs` — same child for MCPJungle and agentgateway.
- [x] **Executor real tool path:** Curated OAS registered via `liveOpenapiRouter` pointing at the mock (`ensure-executor-openapi-app.mjs`). Sandbox calls tools; host performs HTTP. Static fixture inlining removed.
- [x] **Compact search as labeled setting:** `clawql_compact_search` arm with `CLAWQL_SEARCH_COMPACT=1`. Default row keeps compact off until routing eval clears it as product default.
- [x] **Observation-sized `where`:** ClawQL steps use JMESPath that returns code-mode-sized observations (`lib/clawql-shapes.mjs` builds args only; shaping is server-side). Standard JMESPath `length()` for aggregates.
- [x] **`clawql_program` arm:** ADR 0015 v0 `execute_program` plan runner on the board (`CLAWQL_ENABLE_PROGRAMS=1`). Free-form JS / celld isolate still open.
- [x] **Charge `where`/plan as code tokens:** execute `where` (+fields) and program plan JSON count in the same bucket as code-mode scripts; `weighted_mean` on every arm.
- [ ] **Re-publish 3×10k board** with code-arg accounting (prior boards are not the claim).
- [ ] **Real-model 50 sessions / arm:** harness at `run-real-model.mjs`; needs `OPENAI_API_KEY` + `CF_MT_MODEL`.
- [ ] **Blog headline:** hold until publish board + real-model clear.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog can load full `providers/cloudflare/openapi.yaml` under Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers before publication.

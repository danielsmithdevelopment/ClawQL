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
- [x] **Compact program plan:** omit `tool` when `operationId` set (parser default); short ids; drop empty args (872 → 811 code tokens on this workflow).
- [ ] **Real-model 50 sessions / arm × 2 models (different families):** harness ready (`CF_MT_MODEL_FRONTIER` + `CF_MT_MODEL_SMALL` + `OPENAI_API_KEY` as env secrets — never in chat). Composer alone is not the gate; include a smaller / other-family model. Reports failures/retries/turns **and tokens**.
- [x] **Product: `where` examples in execute schema** + fix-named `where_invalid` (`fix` + `example`) so blind real models see the same cues as “shapes visible” without harness leakage.
- [ ] **Blog headline:** hold until publish board + real-model clear.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog can load full `providers/cloudflare/openapi.yaml` under Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers before publication.

# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or stay **tokens-only** (no latency/memory)?
- [ ] **Account sparsity / live recording:** Live fixture + recorded-latency board still open. Synthetic DNS is already scaled to 300.
- [x] **Real-model pin:** Pre-committed in [`SPEC.md`](./SPEC.md) — `gpt-4.1` + `claude-3-5-haiku-20241022`, temperature 0, shared system prompt, interleaved arms; win rules frozen before the run.
- [x] **REST-to-MCP for aggregators:** `lib/cf-rest-mcp.mjs` — same child for MCPJungle and agentgateway.
- [x] **Executor real tool path:** Curated OAS registered via `liveOpenapiRouter` pointing at the mock (`ensure-executor-openapi-app.mjs`). Sandbox calls tools; host performs HTTP. Static fixture inlining removed.
- [x] **Compact search as labeled setting:** `clawql_compact_search` arm with `CLAWQL_SEARCH_COMPACT=1`. Default row keeps compact off until routing eval clears it as product default.
- [x] **Observation-sized `where`:** ClawQL steps use JMESPath that returns code-mode-sized observations (`lib/clawql-shapes.mjs` builds args only; shaping is server-side). Standard JMESPath `length()` for aggregates.
- [x] **`clawql_program` arm:** ADR 0015 v0 `execute_program` plan runner on the board (`CLAWQL_ENABLE_PROGRAMS=1`). Free-form JS / celld isolate still open.
- [x] **Charge `where`/plan as code tokens:** execute `where` (+fields) and program plan JSON count in the same bucket as code-mode scripts; `weighted_mean` on every arm.
- [ ] **Re-publish 3×10k board** with code-arg accounting (prior boards are not the claim).
- [x] **Compact program plan:** omit `tool` when `operationId` set (parser default); short ids; drop empty args (872 → 811 code tokens on this workflow).
- [ ] **Real-model 50 sessions / arm × 2 models:** blocked on secrets (`OPENAI_API_KEY` + OpenAI-compatible base that serves both pinned IDs). Pre-commit: `CF_MT_MODEL_FRONTIER=gpt-4.1`, `CF_MT_MODEL_SMALL=claude-3-5-haiku-20241022`. Arms: `clawql_*` + `executor_v2` on the **local mock** only — **hosted Cloudflare code-mode out of gate**. Verdict from frozen SPEC rules only.
- [x] **Product: `where` examples in execute schema** + fix-named `where_invalid` (`fix` + `example`) so blind real models see the same cues as “shapes visible” without harness leakage.
- [x] **Product: observation budget on execute** — lists: `truncated:true` + totalCount in note; non-lists: size truncate with `shape:"object"` (no fake row count); opt-in `full:true`. Default on for board ClawQL arms.
- [ ] **Blog headline:** hold until publish board + real-model clear.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog can load full `providers/cloudflare/openapi.yaml` under Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers before publication.

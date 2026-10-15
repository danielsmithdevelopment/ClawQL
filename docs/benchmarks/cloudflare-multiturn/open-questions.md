# Open questions

Track decisions here before publication. Unchecked items block a “final” board.

- [ ] **Cloudflare code-mode self-host:** Can [cloudflare/mcp](https://github.com/cloudflare/mcp) run locally with its Dynamic Worker sandbox, or stay **tokens-only** (no latency/memory)?
- [ ] **Account sparsity / live recording:** Live fixture + recorded-latency board still open. Synthetic DNS is already scaled to 300.
- [x] **Real-model pin:** Pre-committed in [`SPEC.md`](./SPEC.md) — Cursor Task `gpt-5.6-sol-medium` + `composer-2.5-fast` (no API secrets; different families; one smaller), shared workflow prompt, interleaved arms; win rules frozen before the run.
- [x] **REST-to-MCP for aggregators:** `lib/cf-rest-mcp.mjs` — same child for MCPJungle and agentgateway.
- [x] **Executor real tool path:** Curated OAS registered via `liveOpenapiRouter` pointing at the mock (`ensure-executor-openapi-app.mjs`). Sandbox calls tools; host performs HTTP. Static fixture inlining removed.
- [x] **Compact search as labeled setting:** `clawql_compact_search` arm with `CLAWQL_SEARCH_COMPACT=1`. Default row keeps compact off until routing eval clears it as product default.
- [x] **Observation-sized `where`:** ClawQL steps use JMESPath that returns code-mode-sized observations (`lib/clawql-shapes.mjs` builds args only; shaping is server-side). Standard JMESPath `length()` for aggregates.
- [x] **`clawql_program` arm:** ADR 0015 v0 `execute_program` plan runner on the board (`CLAWQL_ENABLE_PROGRAMS=1`). Free-form JS / celld isolate still open.
- [x] **Measured defaults vs program-as-core:** ship SQLite OOP + lazy + `where` + observation budget (+ Bun/2-CPU deploy); keep programs **alongside** `execute`. Known-op ≠ program (discovery vs multi-op). Path to single core tool: shrink one-step plan ≈ `execute` size → re-prove CF board + dual-model gate → fan-out board. See [`measured-defaults.md`](./measured-defaults.md).
- [ ] **Cheap one-step program format:** plan boilerplate must not cost ~811 vs known-op’s ~191 code tokens before programs can be the core tool.
- [ ] **Fan-out / join board** + dual-model gate on that board (promotion signal for multi-op programs).
- [x] **Charge `where`/plan as code tokens:** execute `where` (+fields) and program plan JSON count in the same bucket as code-mode scripts; `weighted_mean` on every arm.
- [ ] **Re-publish 3×10k board** with code-arg accounting (prior boards are not the claim).
- [x] **Compact program plan:** omit `tool` when `operationId` set (parser default); short ids; drop empty args (872 → 811 code tokens on this workflow).
- [x] **Real-model 50 sessions / arm × 2 models:** Cursor Task gate cleared — `known_op_beats_code_mode_for_real_models` ([`real-model-cursor-gate-frontier_small.json`](./real-model-cursor-gate-frontier_small.json)). Program was not the headline peer.
- [x] **Product: `where` examples in execute schema** + fix-named `where_invalid` (`fix` + `example`) so blind real models see the same cues as “shapes visible” without harness leakage.
- [x] **Product: observation budget on execute** — lists: `truncated:true` + totalCount in note; non-lists: size truncate with `shape:"object"` (no fake row count); opt-in `full:true`. Default on for board ClawQL arms.
- [ ] **`clawql_routed` (execute-by-description + GLiNER2-Decide):** close first-session discovery gap — server-side candidate narrow → Decide among top ~10 → auto-run calibrated **reads** (writes stay proposal-gated); fallback = top-three compact signatures; re-prove on held-out Cloudflare (description → op) set; measure Decide RSS (shared service if needed). Board arm beside known-op + default.
- [ ] **Compact search routing eval:** clear as product default before claiming first-session parity with code mode.
- [ ] **Blog headline:** hold until publish board + real-model clear.
- [ ] **Full-spec ClawQL load:** Confirm SQLite catalog can load full `providers/cloudflare/openapi.yaml` under Ready memory budget.
- [ ] **Maintainer review window:** Invite Cloudflare / Executor / MCPJungle / agentgateway maintainers before publication.

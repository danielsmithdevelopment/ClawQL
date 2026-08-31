# WebMCP tool drafting specs

Draft extensions for inferring **WebMCP** `registerTool()` declarations from structured interfaces a site already exposes (OpenAPI, GraphQL, HTML forms) — not from arbitrary source code.

| Spec                                                           | Package / code                                                                                                                 | Related                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [webmcp-tool-drafting-v0.1.md](./webmcp-tool-drafting-v0.1.md) | `packages/clawql-core/src/providers/webmcp-draft/` (stub shipped — heuristic inference, in-memory draft store, publish script) | [ClawQL plugin model](../../design/clawql-plugin-model.md) · [PixelDrop smart-upload demo](../../../examples/mcp-api-adapter/pixeldrop/README.md) · [Three-act demo](../../mcp/mcp-ui-three-act-demo.md) |

**Scope boundary:** Sodium-style static analysis across arbitrary repositories is explicitly **out of scope** for v0.1. Sites with no discoverable OpenAPI, GraphQL, or server-rendered forms remain a future, separate investment.

**Stub status:** `WebMcpDraftPlugin` registers `webmcp_draft`, `webmcp_draft_review`, `webmcp_draft_publish`, and `webmcp_draft_rollback`. Inference is deterministic heuristics (no LLM yet). Execute bindings return stub JSON until source-adapter wiring lands. Gateway composition of this plugin is a follow-up.

**Challenge timeline (Aug 2026):** OpenAI WebMCP Challenge work uses **hand-authored** tools (e.g. PixelDrop `upload_photo`). This provider is **post-challenge** infrastructure — it automates what the PixelDrop demo does manually today.

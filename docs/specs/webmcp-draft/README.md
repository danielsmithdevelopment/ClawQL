# WebMCP tool drafting specs

Draft extensions for inferring **WebMCP** `registerTool()` declarations from structured interfaces a site already exposes (OpenAPI, GraphQL, HTML forms) — not from arbitrary source code.

| Spec | Package / code | Related |
| ---- | -------------- | ------- |
| [webmcp-tool-drafting-v0.1.md](./webmcp-tool-drafting-v0.1.md) | `packages/clawql-core/src/providers/webmcp-draft/` | [ClawQL plugin architecture 8.0](../../design/clawql-core-plugin-architecture.md) · [PixelDrop smart-upload demo](../../../examples/mcp-api-adapter/pixeldrop/README.md) |

**Scope boundary:** Sodium-style static analysis across arbitrary repositories is explicitly **out of scope** for v0.1.

**Stub status (on 8.0 `ProviderPlugin`):**

- `WebMcpDraftPlugin` via `defineRegisteringProviderPlugin` — MCP tools at install + blocking `LifecycleHook` (`event: "pre-ingest"`, `scope: "session"`)
- Publish calls core **`fireHooksForEvent`** / **`fireHook`** (ATR never-loosen) — not a parallel hook bus
- Inference is deterministic heuristics (no LLM yet)
- `callBoundOperation` is **stub JSON** — not demo-ready for “working tool on a real site”
- Draft store **`durability: "ephemeral"`** — restart silently drops unreviewed drafts
- Gateway composition of this plugin remains a follow-up

**Challenge timeline:** OpenAI WebMCP Challenge uses hand-authored PixelDrop tools; this provider is post-challenge infrastructure.

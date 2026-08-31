# WebMCP tool drafting specs

Draft extensions for inferring **WebMCP** `registerTool()` declarations from structured interfaces a site already exposes (OpenAPI, GraphQL, HTML forms) — not from arbitrary source code.

| Spec                                                           | Package / code                                     | Related                                                                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [webmcp-tool-drafting-v0.1.md](./webmcp-tool-drafting-v0.1.md) | `packages/clawql-core/src/providers/webmcp-draft/` | [ClawQL plugin architecture 8.0](../../design/clawql-core-plugin-architecture.md) · [PixelDrop smart-upload demo](../../../examples/mcp-api-adapter/pixeldrop/README.md) |

**Scope boundary:** Sodium-style static analysis across arbitrary repositories is explicitly **out of scope** for v0.1.

**Status (on 8.0 `ProviderPlugin`):**

- `WebMcpDraftPlugin` via `defineRegisteringProviderPlugin` — MCP tools at install + blocking `LifecycleHook` (`event: "pre-ingest"`, `scope: "session"`)
- Publish calls core **`fireHooksForEvent`** / **`fireHook`** (ATR never-loosen) — not a parallel hook bus
- Inference is deterministic heuristics (no LLM yet)
- `callBoundOperation` POSTs to `/webmcp-draft/bound-execute` (OpenAPI/GraphQL → `ExecuteService`; forms → `formAction` submit)
- Draft store supports **`durability: "durable"`** via `CLAWQL_WEBMCP_DRAFT_DURABLE=1` or `CLAWQL_WEBMCP_DRAFT_STORE_PATH` (default Live remains ephemeral for tests)
- Gateway composition: opt-in with **`CLAWQL_ENABLE_WEBMCP_DRAFT=1`** (`composeDefaultPlugins` → `createWebMcpDraftGatewayPlugin`)

**Challenge timeline:** OpenAI WebMCP Challenge uses hand-authored PixelDrop tools; this provider is post-challenge infrastructure.

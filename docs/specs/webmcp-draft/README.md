# WebMCP tool drafting specs

Draft extensions for inferring **WebMCP** `registerTool()` declarations from structured interfaces a site already exposes (OpenAPI, GraphQL, HTML forms) — not from arbitrary source code.

| Spec                                                           | Package / code (planned)                                             | Related                                                                                                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [webmcp-tool-drafting-v0.1.md](./webmcp-tool-drafting-v0.1.md) | `packages/clawql-core/providers/webmcp-draft/` (not yet implemented) | [ClawQL plugin model](../../design/clawql-plugin-model.md) · [PixelDrop smart-upload demo](../../../examples/mcp-api-adapter/pixeldrop/README.md) · [Three-act demo](../../mcp/mcp-ui-three-act-demo.md) |

**Scope boundary:** Sodium-style static analysis across arbitrary repositories is explicitly **out of scope** for v0.1. Sites with no discoverable OpenAPI, GraphQL, or server-rendered forms remain a future, separate investment.

**Challenge timeline (Aug 2026):** OpenAI WebMCP Challenge work uses **hand-authored** tools (e.g. PixelDrop `upload_photo`). This provider is **post-challenge** infrastructure — it automates what the PixelDrop demo does manually today.

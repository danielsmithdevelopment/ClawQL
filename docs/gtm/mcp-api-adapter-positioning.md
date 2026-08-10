# GTM: MCP API Adapter (gRPC on-ramp)

**Status:** ✅ Shipped in-repo (`mcp-api-adapter@0.6.0` — any MCP → OpenAPI + GraphQL + `/mcp` + gRPC + `/ws` + gen-cli) — **npm not published yet** (own cadence / `localPackExtras`); **QR** = planned 7th · **`/mcp-ui`** = planned 8th  
**`/mcp-ui` draft:** [`docs/mcp/mcp-ui.md`](../mcp/mcp-ui.md)  
**Canonical design:** [`docs/design/mcp-api-adapter.md`](../design/mcp-api-adapter.md)  
**User guide:** [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md)  
**Package:** [`packages/mcp-api-adapter`](../../packages/mcp-api-adapter/README.md)  
**Example demos:** [`examples/mcp-api-adapter`](../../examples/mcp-api-adapter/README.md)  
**Transport:** [`packages/mcp-grpc-transport`](../../packages/mcp-grpc-transport/README.md)  
**Protocol Fabric:** [`docs/mcp/protocol-fabric.md`](../mcp/protocol-fabric.md) (public) · GTM note [`protocol-fabric.md`](./protocol-fabric.md)  
**Essay draft (publish to PV):** [`pragmaticvectors/mcp-api-adapter.md`](./pragmaticvectors/mcp-api-adapter.md) → `https://pragmaticvectors.com/posts/mcp-api-adapter/`

---

## One-liner

Call MCP tools by name over HTTP **or GraphQL**. Production deployments use **`mcp-grpc-transport`** — the only production TypeScript gRPC transport for MCP. Wrap **any-language** MCP upstream; the adapter runtime is TypeScript.

**Protocol Fabric:** together with ClawQL Core (APIs → MCP), this is MCP as the common IR both directions — see [`protocol-fabric.md`](./protocol-fabric.md).

---

## Why this motion exists

- Most published MCP servers use **stdio** (local) or **Streamable HTTP** (remote). **gRPC is the gap.**
- Google has proposed gRPC as a first-class MCP transport; ClawQL already ships the TypeScript production implementation (`mcp-grpc-transport` 1.0, MCP 2026-07-28).
- Python **[mcpo](https://github.com/open-webui/mcpo)** covers MCP → OpenAPI for OpenWebUI-style consumers (widely known there). It is the right choice when **one REST surface** is enough. It does not offer GraphQL mutations, Streamable HTTP re-export, gRPC scaffolding, or gen-cli — and does not funnel to our transport.
- A **multi-surface** TypeScript on-ramp (`POST /{toolName}` + OpenAPI + GraphQL + `/mcp` + gRPC + `/ws` + gen-cli, + **QR** and **`/mcp-ui`** planned) is the missing adoption wedge: every Swagger / GraphiQL / `/mcp-ui` visitor sees the path to `:50051`; air-gap buyers get an optical surface; operators get forms without a custom frontend.

**Status note:** shipped as `mcp-api-adapter@0.6.0` (**six** surfaces). QR stream is the planned **seventh** — see [`../streams/clawql-qr-stream-transport.md`](../streams/clawql-qr-stream-transport.md). **`/mcp-ui`** is the planned **eighth** — see [`../mcp/mcp-ui.md`](../mcp/mcp-ui.md). GTM one-liner still emphasizes the REST/GraphQL → gRPC funnel for network deployments; `/mcp-ui` is the human on-ramp.

---

## Do not confuse with ClawQL Core

| Direction                      | Product                     | Audience                                                                  |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------- |
| **OpenAPI → MCP**              | ClawQL `search` / `execute` | Agents discovering upstream REST/GraphQL/gRPC APIs                        |
| **MCP → OpenAPI/GraphQL/gRPC** | `mcp-api-adapter` (0.4)     | Workers / OpenWebUI / GraphQL / mesh — wrap **any** MCP (stdio/HTTP/gRPC) |

Use **“OpenAPI on-ramp”**, **“GraphQL on-ramp”**, or **“MCP tools as REST/GraphQL”** in marketing — not bare “OpenAPI gateway.”

---

## Demo narrative (4 steps)

1. **Swagger:** `POST /echo` (or `memory_recall`) with JSON args.
2. **GraphiQL:** `mutation { echo(message: "…") }` — same tool, GraphQL surface.
3. **`/mcp-ui` (when shipped):** fill the auto-scaffolded form, submit, see the result inline — “Swagger UI for MCP.”
4. **OpenAPI extensions:** show `info.x-clawql-grpc` / `x-clawql-graphql` (port 50051, `CallTool`, reflection).
5. **Same call over gRPC:** `grpcurl` / `callToolServerStreamingGrpc` — “this is what production and mesh should use.”

---

## Channels

| Channel                                   | When                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| Vision & Roadmap planned row              | Now (design merged)                                         |
| npm README + Compose/Helm sidecar example | At MVP ship                                                 |
| pragmaticvectors / blog                   | After MVP: “MCP tools as OpenAPI/GraphQL — gRPC underneath” |
| Managed Edge Gateway docs                 | Optional companion port once edge hardening lands           |
| Announcement drafts                       | Bundle with next minor that publishes the package           |

---

## Success signals

- External blogs/issues cite `mcp-api-adapter` **and** `mcp-grpc-transport` together.
- OpenWebUI / Worker samples use our OpenAPI or GraphQL URL rather than only Streamable HTTP.
- `mcp-grpc-transport` npm traffic / GitHub clones rise after on-ramp launch (directional, not a hard KPI).

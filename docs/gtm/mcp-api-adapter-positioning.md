# GTM: MCP API Adapter (gRPC on-ramp)

**Status:** ✅ Shipped in-repo (`mcp-api-adapter@0.5.1` — any MCP → OpenAPI + GraphQL + `/mcp` + gRPC + gen-cli) — npm publish on independent cadence  
**Canonical design:** [`docs/design/mcp-api-adapter.md`](../design/mcp-api-adapter.md)  
**User guide:** [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md)  
**Package:** [`packages/mcp-api-adapter`](../../packages/mcp-api-adapter/README.md)  
**Example demos:** [`examples/mcp-api-adapter`](../../examples/mcp-api-adapter/README.md)  
**Transport:** [`packages/mcp-grpc-transport`](../../packages/mcp-grpc-transport/README.md)

---

## One-liner

Call MCP tools by name over HTTP, GraphQL, **or Streamable HTTP `/mcp`**. Production deployments use **`mcp-grpc-transport`** — the only production TypeScript gRPC transport for MCP. Optional **`gen-cli`** scaffolds a thin CLI today; PrintingPress is the signed-binary path later.

---

## Why this motion exists

- Most published MCP servers use **stdio** (local) or **Streamable HTTP** (remote). **gRPC is the gap.**
- Google has proposed gRPC as a first-class MCP transport; ClawQL already ships the TypeScript production implementation (`mcp-grpc-transport` 1.0, MCP 2026-07-28).
- Python **mcpo** covers MCP → OpenAPI for OpenWebUI-style consumers but is stdio/FastAPI-centric and does not funnel to our transport.
- A **gRPC-first** TypeScript on-ramp (`POST /{toolName}` + OpenAPI + GraphQL + `/mcp` + gen-cli) is the missing adoption wedge: every Swagger / GraphiQL / IDE visitor sees the path to `:50051`.

---

## Do not confuse with ClawQL Core

| Direction                                 | Product                     | Audience                                                                              |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| **OpenAPI → MCP**                         | ClawQL `search` / `execute` | Agents discovering upstream REST/GraphQL/gRPC APIs                                    |
| **MCP → OpenAPI/GraphQL/`/mcp`/gRPC/CLI** | `mcp-api-adapter` (0.5.1)   | Workers / OpenWebUI / GraphQL / IDEs / mesh — wrap **any** MCP (stdio/HTTP/gRPC)      |

Use **“OpenAPI on-ramp”**, **“GraphQL on-ramp”**, or **“MCP tools as REST/GraphQL”** in marketing — not bare “OpenAPI gateway.” Distinct from ClawQL’s **Agentic Gateway** product name.

---

## Demo narrative (5 steps)

1. **Swagger:** `POST /echo` (or `memory_recall`) with JSON args.
2. **GraphiQL:** `mutation { echo(message: "…") }` — same tool, GraphQL surface.
3. **`/mcp`:** point an IDE or MCP SDK client at `http://127.0.0.1:8090/mcp` — same catalog over Streamable HTTP.
4. **OpenAPI extensions:** show `info.x-clawql-grpc` / `x-clawql-graphql` (port 50051, `CallTool`, reflection).
5. **Same call over gRPC:** `grpcurl` / `callToolServerStreamingGrpc` — “this is what production and mesh should use.” Optional: `gen-cli` for a thin local CLI over REST.

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
- IDE agents connect to adapter `/mcp` when wrapping stdio-only or gRPC-only servers.
- `mcp-grpc-transport` npm traffic / GitHub clones rise after on-ramp launch (directional, not a hard KPI).

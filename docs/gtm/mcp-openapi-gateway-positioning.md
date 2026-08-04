# GTM: MCP OpenAPI Gateway (gRPC on-ramp)

**Status:** 🚧 MVP shipped in-repo (`mcp-openapi-gateway@0.1.0`) — npm publish on independent cadence  
**Canonical design:** [`docs/design/mcp-openapi-gateway.md`](../design/mcp-openapi-gateway.md)  
**Package:** [`packages/mcp-openapi-gateway`](../../packages/mcp-openapi-gateway/README.md)  
**Example demos:** [`examples/mcp-openapi-gateway`](../../examples/mcp-openapi-gateway/README.md)  
**Transport:** [`packages/mcp-grpc-transport`](../../packages/mcp-grpc-transport/README.md)

---

## One-liner

Call MCP tools by name over HTTP. Production deployments use **`mcp-grpc-transport`** — the only production TypeScript gRPC transport for MCP.

---

## Why this motion exists

- Most published MCP servers use **stdio** (local) or **Streamable HTTP** (remote). **gRPC is the gap.**
- Google has proposed gRPC as a first-class MCP transport; ClawQL already ships the TypeScript production implementation (`mcp-grpc-transport` 1.0, MCP 2026-07-28).
- Python **mcpo** covers MCP → OpenAPI for OpenWebUI-style consumers but is stdio/FastAPI-centric and does not funnel to our transport.
- A **gRPC-first** TypeScript on-ramp (`POST /{toolName}` + OpenAPI + Swagger) is the missing adoption wedge: every Swagger visitor sees `x-clawql-grpc` and the path to `:50051`.

---

## Do not confuse with ClawQL Core

| Direction | Product | Audience |
| --------- | ------- | -------- |
| **OpenAPI → MCP** | ClawQL `search` / `execute` | Agents discovering upstream REST/GraphQL/gRPC APIs |
| **MCP → OpenAPI** | `mcp-openapi-gateway` (planned) | Workers / OpenWebUI / gateways that speak REST, not MCP |

Use **“OpenAPI on-ramp”** or **“MCP tools as REST”** in marketing — not bare “OpenAPI gateway.”

---

## Demo narrative (3 steps)

1. **Swagger:** `POST /memory_recall` with JSON args → vault results.  
2. **OpenAPI extensions:** show `info.x-clawql-grpc` (port 50051, `CallTool`, reflection, large-payload note).  
3. **Same call over gRPC:** `grpcurl` / `callToolServerStreamingGrpc` — “this is what production and mesh should use.”

---

## Channels

| Channel | When |
| ------- | ---- |
| Vision & Roadmap planned row | Now (design merged) |
| npm README + Compose/Helm sidecar example | At MVP ship |
| pragmaticvectors / blog | After MVP: “MCP tools as OpenAPI — gRPC underneath” |
| Managed Edge Gateway docs | Optional companion port once edge hardening lands |
| Announcement drafts | Bundle with next minor that publishes the package |

---

## Success signals

- External blogs/issues cite `mcp-openapi-gateway` **and** `mcp-grpc-transport` together.  
- OpenWebUI / Worker samples use our OpenAPI URL rather than only Streamable HTTP.  
- `mcp-grpc-transport` npm traffic / GitHub clones rise after on-ramp launch (directional, not a hard KPI).

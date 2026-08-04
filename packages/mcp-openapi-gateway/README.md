# mcp-openapi-gateway

**Point at any MCP server** (stdio, Streamable HTTP, or gRPC) and automatically scaffold **OpenAPI + GraphQL + gRPC** so the same tools are callable on all three surfaces.

```text
  Any MCP server
  ├─ stdio (npx @modelcontextprotocol/…)
  ├─ Streamable HTTP (http://host/mcp)
  └─ gRPC (mcp-grpc-transport)
           │
           ▼
   mcp-openapi-gateway
           │
           ├── OpenAPI  POST /{toolName}  · /openapi.json · /docs
           ├── GraphQL  POST /graphql     · /graphiql
           └── gRPC     model_context_protocol.Mcp/CallTool
                        (upstream address, or locally scaffolded)
```

> Call MCP tools by name over HTTP or GraphQL. Production / mesh / large payloads prefer **gRPC** via [`mcp-grpc-transport`](../mcp-grpc-transport) — the production TypeScript gRPC transport for MCP.

| Doc | Path |
| --- | ---- |
| User guide | [`docs/mcp/mcp-openapi-gateway.md`](../../docs/mcp/mcp-openapi-gateway.md) |
| Design | [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md) |
| Positioning | [`docs/gtm/mcp-openapi-gateway-positioning.md`](../../docs/gtm/mcp-openapi-gateway-positioning.md) |
| Live demo | [`examples/mcp-openapi-gateway/`](../../examples/mcp-openapi-gateway/) |

## Install

```bash
npm install mcp-openapi-gateway mcp-grpc-transport @modelcontextprotocol/sdk
```

## CLI — wrap any MCP server

```bash
# Streamable HTTP MCP → REST + GraphQL + local gRPC
npx mcp-openapi-gateway --mcp-url http://127.0.0.1:8080/mcp --listen 0.0.0.0:8090

# stdio MCP package → same triple surface
npx mcp-openapi-gateway --stdio -- npx -y @modelcontextprotocol/server-everything

# Existing gRPC MCP (ClawQL / ENABLE_GRPC) → OpenAPI + GraphQL on-ramp
npx mcp-openapi-gateway --grpc-address 127.0.0.1:50051 --listen 0.0.0.0:8090
```

| Flag | Purpose |
| ---- | ------- |
| `--mcp-url <url>` | Upstream Streamable HTTP MCP |
| `--stdio -- <cmd…>` | Spawn upstream over stdio |
| `--grpc-address <host:port>` | Upstream already speaking gRPC |
| `--listen <host:port>` | OpenAPI + GraphQL bind (default `0.0.0.0:8090`) |
| `--grpc-listen <host:port>` | Scaffolded gRPC bind for stdio/HTTP (default `127.0.0.1:0`) |
| `--no-grpc` | Skip local gRPC scaffolding |
| `--api-key <key>` | Optional edge auth |

## Programmatic API

```ts
import { startMcpGateway } from "mcp-openapi-gateway";

// Any upstream shape:
const gw = await startMcpGateway({
  upstream: { kind: "http", url: "http://127.0.0.1:8080/mcp" },
  // upstream: { kind: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  // upstream: { kind: "grpc", address: "127.0.0.1:50051" },
  host: "127.0.0.1",
  port: 8090,
  grpcListen: "127.0.0.1:50051", // scaffold when upstream is stdio/HTTP
});

console.log(gw.url, gw.grpcAddress, gw.getCatalog().surfaces);
```

`startMcpOpenApiGateway({ grpcAddress })` remains as a compatibility wrapper around `upstream: { kind: "grpc" }`.

## HTTP routes

| Path | Purpose |
| ---- | ------- |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI 3.1 (`x-clawql-grpc`, `x-clawql-graphql`) |
| `POST /{toolName}` | REST tool call |
| `POST /graphql` | GraphQL (per-tool mutations + `callTool`) |
| `GET /graphiql` | GraphiQL |
| `GET /graphql/schema.graphql` | Printed SDL |
| `GET /tools` | Catalog (`upstream`, `upstreamKind`, `surfaces`, tools) |
| `GET /healthz` | Liveness |

## GraphQL shape

```graphql
type Query {
  health: GatewayHealth!
  tools: [McpTool!]!
}

type Mutation {
  callTool(name: String!, args: JSON): JSON
  echo(message: String!): JSON   # one field per MCP tool
  # …
}
```

## How scaffolding works

| Upstream | REST / GraphQL | gRPC surface |
| -------- | -------------- | ------------ |
| **gRPC** | Calls upstream `CallTool` | Reuses upstream address |
| **Streamable HTTP** | SDK client → upstream | Local `maybeStartGrpcMcpServer` delegates to the same client |
| **stdio** | SDK client → child process | Same local gRPC scaffold |

Inverse of ClawQL Core `search` / `execute` (**OpenAPI → MCP**). This package is **MCP tools → OpenAPI/GraphQL/gRPC**.

## License

Apache-2.0

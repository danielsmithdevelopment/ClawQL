# mcp-api-adapter

**Standalone package:** point it at **any** MCP server and instantly get **OpenAPI + GraphQL + gRPC** for the same tools. No ClawQL install required.

```bash
# Instant — wrap a remote MCP server
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp

# Instant — spawn a stdio MCP package
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything

# Instant — on-ramp in front of gRPC MCP
npx mcp-api-adapter --grpc-address 127.0.0.1:50051
```

Open `http://127.0.0.1:8090/docs` (Swagger) or `/graphiql`. Call tools with `POST /{toolName}` or GraphQL mutations. gRPC is reused or scaffolded automatically.

```text
  Any MCP server
  ├─ stdio
  ├─ Streamable HTTP
  └─ gRPC
           │
           ▼
   mcp-api-adapter   (standalone)
           │
           ├── OpenAPI   POST /{toolName}  · /docs
           ├── GraphQL   POST /graphql     · /graphiql
           └── gRPC      CallTool (upstream or local scaffold)
```

> Distinct from ClawQL’s **Agentic Gateway** (the platform). This package only adapts MCP tools onto APIs.

| Doc | Path |
| --- | ---- |
| User guide | [`docs/mcp/mcp-api-adapter.md`](../../docs/mcp/mcp-api-adapter.md) |
| Design | [`docs/design/mcp-api-adapter.md`](../../docs/design/mcp-api-adapter.md) |
| Positioning | [`docs/gtm/mcp-api-adapter-positioning.md`](../../docs/gtm/mcp-api-adapter-positioning.md) |
| Live demo | [`examples/mcp-api-adapter/`](../../examples/mcp-api-adapter/) |

## Install

```bash
npm install mcp-api-adapter
# peer/runtime deps pulled as needed:
#   @modelcontextprotocol/sdk  mcp-grpc-transport
```

Or skip install and use `npx` as above.

## CLI

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
import { startMcpApiAdapter } from "mcp-api-adapter";

const adapter = await startMcpApiAdapter({
  upstream: { kind: "http", url: "http://127.0.0.1:8080/mcp" },
  // upstream: { kind: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  // upstream: { kind: "grpc", address: "127.0.0.1:50051" },
  host: "127.0.0.1",
  port: 8090,
  grpcListen: "127.0.0.1:50051",
});

console.log(adapter.url, adapter.grpcAddress, adapter.getCatalog().surfaces);
```

Deprecated aliases from the former `mcp-openapi-gateway` name (`startMcpOpenApiGateway`, `startMcpGateway`, …) remain exported.

## HTTP routes

| Path | Purpose |
| ---- | ------- |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI 3.1 |
| `POST /{toolName}` | REST tool call |
| `POST /graphql` | GraphQL |
| `GET /graphiql` | GraphiQL |
| `GET /tools` | Catalog |
| `GET /healthz` | Liveness |

## How it works

| Upstream | REST / GraphQL | gRPC |
| -------- | -------------- | ---- |
| **gRPC** | Upstream `CallTool` | Reuses address |
| **Streamable HTTP** | SDK client → upstream | Local scaffold via `mcp-grpc-transport` |
| **stdio** | SDK client → child | Same local scaffold |

Inverse of ClawQL Core `search` / `execute` (**OpenAPI → MCP**). This package is **MCP → APIs**.

## License

Apache-2.0

# mcp-api-adapter

**Standalone package:** point it at **any** MCP server (any language that speaks MCP) and instantly get **OpenAPI + GraphQL + Streamable HTTP `/mcp` + gRPC** for the same tools — plus an optional generated CLI. The adapter itself is TypeScript (`npx`); the upstream is language-agnostic. No ClawQL install required.

Closest single-surface alternative: Python **[mcpo](https://github.com/open-webui/mcpo)** (OpenAPI only). Prefer this package when you need all five surfaces — see [Protocol Fabric](../../docs/gtm/protocol-fabric.md).

```bash
# Instant — wrap a remote MCP server
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp

# Instant — spawn a stdio MCP package (exposes /mcp for IDEs)
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything

# Instant — on-ramp in front of gRPC MCP
npx mcp-api-adapter --grpc-address 127.0.0.1:50051

# Generate a thin CLI over the adapter REST API
npx mcp-api-adapter gen-cli --out ./my-cli --stdio -- npx -y @modelcontextprotocol/server-everything
```

```text
  Any MCP server
  ├─ stdio
  ├─ Streamable HTTP
  └─ gRPC
           │
           ▼
   mcp-api-adapter   (standalone)
           │
           ├── OpenAPI     POST /{toolName}  · /docs
           ├── GraphQL     POST /graphql     · /graphiql
           ├── MCP         Streamable HTTP   · /mcp
           ├── gRPC        CallTool (upstream or local scaffold)
           └── gen-cli     thin Node CLI (PrintingPress later)
```

> Distinct from ClawQL’s **Agentic Gateway**. This package only adapts MCP tools onto APIs (including re-exporting MCP itself when useful).

| Doc | Path |
| --- | ---- |
| User guide | [`docs/mcp/mcp-api-adapter.md`](../../docs/mcp/mcp-api-adapter.md) |
| Design | [`docs/design/mcp-api-adapter.md`](../../docs/design/mcp-api-adapter.md) |
| Example | [`examples/mcp-api-adapter/`](../../examples/mcp-api-adapter/) |

## HTTP routes

| Path | Purpose |
| ---- | ------- |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI 3.1 |
| `POST /{toolName}` | REST tool call |
| `POST /graphql` | GraphQL |
| `GET /graphiql` | GraphiQL |
| `POST/GET/DELETE /mcp` | Streamable HTTP MCP (same tools) |
| `GET /tools` | Catalog |
| `GET /healthz` | Liveness |

Disable MCP with `--no-mcp`. Change path with `--mcp-path /mcp`.

## Programmatic API

```ts
import { startMcpApiAdapter, generateToolCli } from "mcp-api-adapter";

const adapter = await startMcpApiAdapter({
  upstream: { kind: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  host: "127.0.0.1",
  port: 8090,
  mcpPath: "/mcp",
  grpcListen: "127.0.0.1:50051",
});

await generateToolCli({
  outDir: "./my-cli",
  tools: adapter.getCatalog().tools,
  baseUrl: adapter.url,
  upstreamLabel: adapter.upstream,
});
```

## gen-cli + PrintingPress

`gen-cli` writes a **zero-dependency** Node CLI that `POST`s to `/{toolName}` on a running adapter. When **clawql-printingpress** ships, prefer it for signed binaries and richer packaging — same tool catalog.

## License

Apache-2.0

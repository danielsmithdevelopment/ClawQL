# mcp-openapi-gateway

**OpenAPI on-ramp for MCP tools** — call tools by name over HTTP (`POST /{toolName}`), with **gRPC `CallTool`** via [`mcp-grpc-transport`](../mcp-grpc-transport) as the preferred backend.

```text
OpenAPI / Workers / Swagger UI
        │
        ▼
  mcp-openapi-gateway   ← POST /echo, /openapi.json, /docs
        │
        ▼
  model_context_protocol.Mcp/CallTool   (mcp-grpc-transport)
```

> Call MCP tools by name over HTTP. Production deployments use **mcp-grpc-transport** — the only production TypeScript gRPC transport for MCP.

Design: [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md).

## Install

```bash
npm install mcp-openapi-gateway mcp-grpc-transport
```

## CLI

Point at any MCP server with `ENABLE_GRPC=1` (default port `50051`):

```bash
npx mcp-openapi-gateway --grpc-address 127.0.0.1:50051 --listen 0.0.0.0:8090
```

Then:

- Swagger UI: `http://127.0.0.1:8090/docs`
- OpenAPI: `http://127.0.0.1:8090/openapi.json` (includes `info.x-clawql-grpc`)
- Tools: `GET /tools`
- Call: `POST /{toolName}` with JSON arguments

## Library

```ts
import { startMcpOpenApiGateway } from "mcp-openapi-gateway";

const gw = await startMcpOpenApiGateway({
  grpcAddress: "127.0.0.1:50051",
  port: 8090,
});
```

## Full demo (OpenAPI + gRPC together)

See [`examples/mcp-openapi-gateway/`](../../examples/mcp-openapi-gateway/) — one MCP server with both surfaces, plus REST and gRPC client demos.

## License

Apache-2.0

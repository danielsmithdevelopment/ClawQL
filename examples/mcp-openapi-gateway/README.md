# Example: scaffold OpenAPI + GraphQL + gRPC for MCP tools

This example shows two patterns:

1. **gRPC-native demo server** — `server.mjs` starts tools on gRPC and puts `mcp-openapi-gateway` in front (OpenAPI + GraphQL).
2. **Any-MCP wrap** — point the CLI at *any* Streamable HTTP or stdio MCP server; the gateway scaffolds REST + GraphQL + local gRPC for you.

| Surface | How | Default (demo server) |
| ------- | --- | --------------------- |
| **gRPC MCP** | `mcp-grpc-transport` — `ListTools` / `CallTool` | `127.0.0.1:50051` |
| **OpenAPI on-ramp** | `mcp-openapi-gateway` — `POST /{toolName}` + Swagger | `http://127.0.0.1:8090` |
| **GraphQL on-ramp** | same gateway — `POST /graphql` + GraphiQL | `http://127.0.0.1:8090/graphql` |

Demo tools: `echo`, `add`, `greet`.

**User guide:** [`docs/mcp/mcp-openapi-gateway.md`](../../docs/mcp/mcp-openapi-gateway.md).

## Prerequisites

From the ClawQL repo root:

```bash
npm install
npm run build -w mcp-grpc-transport
npm run build -w mcp-openapi-gateway
```

## A. Demo server (gRPC upstream)

```bash
node examples/mcp-openapi-gateway/server.mjs
```

Optional env: `GRPC_PORT` (default `50051`), `OPENAPI_PORT` (default `8090`), `ENABLE_GRPC_REFLECTION`, `MCP_OPENAPI_GATEWAY_API_KEY`.

## B. Wrap any MCP server (CLI)

```bash
# Streamable HTTP MCP already running somewhere:
npx mcp-openapi-gateway --mcp-url http://127.0.0.1:8080/mcp \
  --listen 0.0.0.0:8090 --grpc-listen 127.0.0.1:50051

# Or spawn a stdio MCP package:
npx mcp-openapi-gateway --stdio -- npx -y @modelcontextprotocol/server-everything
```

## Call surfaces

```bash
node examples/mcp-openapi-gateway/demo-rest.mjs
node examples/mcp-openapi-gateway/demo-graphql.mjs
node examples/mcp-openapi-gateway/demo-grpc.mjs
node examples/mcp-openapi-gateway/demo-all.mjs   # parity check
```

```bash
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}' | jq .
open http://127.0.0.1:8090/docs
open http://127.0.0.1:8090/graphiql
```

## Positioning

OpenAPI + GraphQL are **on-ramps**. gRPC (`mcp-grpc-transport`) is the **production** path — see `info.x-clawql-grpc` in `/openapi.json`.

Design: [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md).

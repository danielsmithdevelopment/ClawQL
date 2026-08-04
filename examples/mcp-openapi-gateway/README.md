# Example: MCP server with OpenAPI **and** gRPC

One demo MCP server exposes the **same tools** on two surfaces at once:

| Surface | How | Default |
| ------- | --- | ------- |
| **gRPC MCP** | `mcp-grpc-transport` — `ListTools` / `CallTool` | `127.0.0.1:50051` |
| **OpenAPI on-ramp** | `mcp-openapi-gateway` — `POST /{toolName}` + Swagger | `http://127.0.0.1:8090` |

Demo tools: `echo`, `add`, `greet`.

## Prerequisites

From the ClawQL repo root:

```bash
npm install
npm run build -w mcp-grpc-transport
npm run build -w mcp-openapi-gateway
```

## 1. Start the server

```bash
node examples/mcp-openapi-gateway/server.mjs
```

You should see both addresses printed, plus links to `/docs` and `/openapi.json`.

Optional env:

| Env | Default | Meaning |
| --- | ------- | ------- |
| `GRPC_PORT` | `50051` | gRPC listen port |
| `OPENAPI_PORT` | `8090` | OpenAPI HTTP port |
| `ENABLE_GRPC_REFLECTION` | `1` | `grpcurl list` / `describe` |
| `MCP_OPENAPI_GATEWAY_API_KEY` | _(off)_ | Require `X-API-Key` on OpenAPI routes |

## 2. Call via OpenAPI (REST)

```bash
node examples/mcp-openapi-gateway/demo-rest.mjs
```

Or manually:

```bash
curl -s http://127.0.0.1:8090/tools | jq .
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}' | jq .
open http://127.0.0.1:8090/docs   # Swagger UI
```

## 3. Call via gRPC

```bash
node examples/mcp-openapi-gateway/demo-grpc.mjs
```

Or with grpcurl (reflection on):

```bash
grpcurl -plaintext 127.0.0.1:50051 list
grpcurl -plaintext -H 'mcp-protocol-version: 2026-07-28' \
  127.0.0.1:50051 model_context_protocol.Mcp/ListTools
```

## 4. Side-by-side parity

```bash
node examples/mcp-openapi-gateway/demo-all.mjs
```

Runs the same tool calls over REST and gRPC and prints both results.

## Positioning

OpenAPI is the **on-ramp** for Workers / OpenWebUI / anything that speaks REST.  
gRPC (`mcp-grpc-transport`) is the **production** path — see `info.x-clawql-grpc` in `/openapi.json`.

Design: [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md).

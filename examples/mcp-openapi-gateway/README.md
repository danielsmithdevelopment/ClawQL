# Example: MCP server with OpenAPI, GraphQL, **and** gRPC

One demo MCP server exposes the **same tools** on three surfaces at once:

| Surface | How | Default |
| ------- | --- | ------- |
| **gRPC MCP** | `mcp-grpc-transport` — `ListTools` / `CallTool` | `127.0.0.1:50051` |
| **OpenAPI on-ramp** | `mcp-openapi-gateway` — `POST /{toolName}` + Swagger | `http://127.0.0.1:8090` |
| **GraphQL on-ramp** | same gateway — `POST /graphql` + GraphiQL | `http://127.0.0.1:8090/graphql` |

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

You should see gRPC, OpenAPI, and GraphQL addresses printed.

Optional env:

| Env | Default | Meaning |
| --- | ------- | ------- |
| `GRPC_PORT` | `50051` | gRPC listen port |
| `OPENAPI_PORT` | `8090` | OpenAPI + GraphQL HTTP port |
| `ENABLE_GRPC_REFLECTION` | `1` | `grpcurl list` / `describe` |
| `MCP_OPENAPI_GATEWAY_API_KEY` | _(off)_ | Require `X-API-Key` on HTTP routes |

## 2. Call via OpenAPI (REST)

```bash
node examples/mcp-openapi-gateway/demo-rest.mjs
```

```bash
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}' | jq .
open http://127.0.0.1:8090/docs
```

## 3. Call via GraphQL

```bash
node examples/mcp-openapi-gateway/demo-graphql.mjs
```

```bash
curl -s http://127.0.0.1:8090/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation { echo(message: \"hi\") }"}' | jq .
open http://127.0.0.1:8090/graphiql
```

Per-tool mutations are generated from `ListTools` (`echo`, `add`, …). Generic escape hatch: `callTool(name:, args:)`.

## 4. Call via gRPC

```bash
node examples/mcp-openapi-gateway/demo-grpc.mjs
```

```bash
grpcurl -plaintext 127.0.0.1:50051 list
```

## 5. Side-by-side parity (all three)

```bash
node examples/mcp-openapi-gateway/demo-all.mjs
```

## Positioning

OpenAPI + GraphQL are **on-ramps** for clients that don’t speak MCP.  
gRPC (`mcp-grpc-transport`) is the **production** path — see `info.x-clawql-grpc` in `/openapi.json` and the GraphiQL banner.

Design: [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md).

# mcp-openapi-gateway

**OpenAPI + GraphQL on-ramp for MCP tools** — call tools by name over HTTP, with **gRPC `CallTool`** via [`mcp-grpc-transport`](../mcp-grpc-transport) as the preferred backend.

```text
OpenAPI / GraphQL / Workers / Swagger / GraphiQL
        │
        ▼
  mcp-openapi-gateway   ← POST /echo · POST /graphql · /docs · /graphiql
        │
        ▼
  model_context_protocol.Mcp/CallTool   (mcp-grpc-transport)
```

> Call MCP tools by name over HTTP or GraphQL. Production deployments use **mcp-grpc-transport** — the only production TypeScript gRPC transport for MCP.

Design: [`docs/design/mcp-openapi-gateway.md`](../../docs/design/mcp-openapi-gateway.md).

## Install

```bash
npm install mcp-openapi-gateway mcp-grpc-transport
```

## CLI

```bash
npx mcp-openapi-gateway --grpc-address 127.0.0.1:50051 --listen 0.0.0.0:8090
```

| Path | Purpose |
| ---- | ------- |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI 3.1 (`x-clawql-grpc`, `x-clawql-graphql`) |
| `POST /{toolName}` | REST tool call |
| `POST /graphql` | GraphQL (per-tool mutations + `callTool`) |
| `GET /graphiql` | GraphiQL |
| `GET /graphql/schema.graphql` | Printed SDL |
| `GET /tools` | Raw tool catalog |
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
  add(a: Float!, b: Float!): JSON
  # …
}
```

Top-level JSON Schema properties become GraphQL args when possible; otherwise use `args: JSON` / `callTool`.

## Full demo (three surfaces)

See [`examples/mcp-openapi-gateway/`](../../examples/mcp-openapi-gateway/).

## License

Apache-2.0

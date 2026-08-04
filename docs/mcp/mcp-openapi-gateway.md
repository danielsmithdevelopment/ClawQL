# MCP OpenAPI Gateway — user guide

**Package:** [`mcp-openapi-gateway`](../../packages/mcp-openapi-gateway/) (`0.3.0+`)  
**Design:** [`docs/design/mcp-openapi-gateway.md`](../design/mcp-openapi-gateway.md)  
**Example:** [`examples/mcp-openapi-gateway/`](../../examples/mcp-openapi-gateway/)

## What it does

Point the gateway at **any** MCP server and it scaffolds three call surfaces from `ListTools`:

1. **OpenAPI / REST** — `POST /{toolName}` + Swagger at `/docs`
2. **GraphQL** — per-tool mutations + `callTool` at `/graphql` (GraphiQL at `/graphiql`)
3. **gRPC** — `model_context_protocol.Mcp/CallTool` via [`mcp-grpc-transport`](../../packages/mcp-grpc-transport/) (upstream address, or a **scaffolded** local server when the upstream is stdio or Streamable HTTP)

```text
stdio | Streamable HTTP | gRPC MCP
              │
              ▼
      mcp-openapi-gateway
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 OpenAPI   GraphQL    gRPC
```

This is the inverse of ClawQL Core **`search` / `execute`** (those turn OpenAPI ops into MCP tools). Here, MCP tools become HTTP/GraphQL (and gRPC when needed).

## Quick start

### 1. Wrap a Streamable HTTP MCP server

```bash
npx mcp-openapi-gateway \
  --mcp-url http://127.0.0.1:8080/mcp \
  --listen 0.0.0.0:8090 \
  --grpc-listen 127.0.0.1:50051
```

Then:

```bash
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hi"}'

curl -s http://127.0.0.1:8090/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation { echo(message: \"hi\") }"}'

# scaffolded gRPC (grpcurl / mcp-grpc-transport clients)
grpcurl -plaintext 127.0.0.1:50051 list
```

### 2. Wrap a stdio MCP package

```bash
npx mcp-openapi-gateway --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

Everything after `--` is the child command. The gateway keeps the stdio session open, serves REST/GraphQL, and (unless `--no-grpc`) starts a local gRPC MCP bridge that delegates to the same session.

### 3. On-ramp in front of an existing gRPC MCP server

```bash
# ClawQL or any ENABLE_GRPC=1 mcp-grpc-transport server
npx mcp-openapi-gateway --grpc-address 127.0.0.1:50051 --listen 0.0.0.0:8090
```

No second gRPC server is started; `/openapi.json` advertises the upstream address in `info.x-clawql-grpc`.

## CLI reference

| Flag / env                                          | Meaning                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `--mcp-url`                                         | Streamable HTTP MCP URL                        |
| `--stdio -- <cmd…>`                                 | Spawn MCP over stdio                           |
| `--grpc-address` / `CLAWQL_MCP_GRPC_ADDR`           | Upstream gRPC `host:port`                      |
| `--grpc-host` / `--grpc-port`                       | Alternate gRPC address pieces                  |
| `--listen` / `MCP_OPENAPI_GATEWAY_LISTEN`           | HTTP bind (default `0.0.0.0:8090`)             |
| `--grpc-listen` / `MCP_OPENAPI_GATEWAY_GRPC_LISTEN` | Scaffolded gRPC bind (default `127.0.0.1:0`)   |
| `--no-grpc`                                         | Do not scaffold local gRPC (stdio/HTTP only)   |
| `--api-key` / `MCP_OPENAPI_GATEWAY_API_KEY`         | Require `X-API-Key` or `Authorization: Bearer` |
| `--refresh-ms`                                      | Re-`ListTools` poll interval                   |
| `--title`                                           | Swagger / GraphiQL title                       |

Exactly one upstream mode is required (`--mcp-url`, `--stdio`, or `--grpc-address` / env default).

## Programmatic API

```ts
import { startMcpGateway } from "mcp-openapi-gateway";

const gw = await startMcpGateway({
  upstream: { kind: "http", url: "http://127.0.0.1:8080/mcp" },
  host: "0.0.0.0",
  port: 8090,
  grpcListen: "127.0.0.1:50051",
  apiKey: process.env.MCP_OPENAPI_GATEWAY_API_KEY,
});

// gw.url — OpenAPI + GraphQL
// gw.grpcAddress — upstream or scaffolded gRPC
// gw.getCatalog() — tools + surfaces + upstreamKind
await gw.close();
```

Upstream union:

```ts
type UpstreamOptions =
  | { kind: "grpc"; address: string; protocolVersion?: string }
  | { kind: "http"; url: string }
  | { kind: "stdio"; command: string; args?: string[]; env?: Record<string, string> };
```

Compatibility: `startMcpOpenApiGateway({ grpcAddress })` ≡ `startMcpGateway({ upstream: { kind: "grpc", address }, grpcListen: false })`.

## HTTP surface map

| Method / path                 | Role                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `GET /healthz`                | Liveness (`upstreamKind`, `surfaces`, `grpcAddress`) |
| `GET /tools`                  | Full catalog JSON                                    |
| `GET /openapi.json`           | OpenAPI 3.1 generated from tool `inputSchema`        |
| `GET /docs`                   | Swagger UI                                           |
| `POST /{toolName}`            | Invoke tool; JSON body = tool arguments              |
| `POST /graphql`               | GraphQL endpoint                                     |
| `GET /graphiql`               | GraphiQL IDE                                         |
| `GET /graphql/schema.graphql` | SDL                                                  |

Responses prefer MCP `structuredContent`, else parse single text content as JSON, else return a `{ content, text, isError }` envelope.

## GraphQL conventions

- **`Query.tools` / `Query.health`** — catalog + health
- **`Mutation.<toolName>(…)`** — one field per tool; top-level JSON Schema properties become GraphQL args when GraphQL-safe
- **`Mutation.callTool(name, args)`** — generic escape hatch for awkward schemas

## Auth

When `--api-key` (or `MCP_OPENAPI_GATEWAY_API_KEY`) is set, all routes except `/healthz` require:

- `X-API-Key: <key>`, or
- `Authorization: Bearer <key>`

gRPC auth is **not** invented here — use mesh/mTLS / interceptors on `mcp-grpc-transport` for production gRPC.

## Relationship to other ClawQL pieces

| Piece                           | Direction                                 |
| ------------------------------- | ----------------------------------------- |
| **`mcp-openapi-gateway`**       | MCP → OpenAPI + GraphQL (+ gRPC scaffold) |
| **ClawQL `search` / `execute`** | OpenAPI → MCP tools                       |
| **`mcp-grpc-transport`**        | Production TypeScript MCP gRPC transport  |
| **Panguard bridge**             | Policy / JWT ATR in front of MCP          |

## Troubleshooting

| Symptom                        | Check                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `Provide exactly one upstream` | Only one of `--mcp-url` / `--stdio` / `--grpc-address`                             |
| No gRPC surface for HTTP/stdio | Ensure `--no-grpc` is unset; gateway sets `ENABLE_GRPC` while scaffolding          |
| Empty GraphQL args             | Upstream `ListTools` `inputSchema` missing/empty — use `callTool(name, args: {…})` |
| `502 upstream CallTool failed` | Upstream down, wrong URL, or tool threw `isError`                                  |

## Further reading

- Package README: [`packages/mcp-openapi-gateway/README.md`](../../packages/mcp-openapi-gateway/README.md)
- Design & non-goals: [`docs/design/mcp-openapi-gateway.md`](../design/mcp-openapi-gateway.md)
- GTM positioning: [`docs/gtm/mcp-openapi-gateway-positioning.md`](../gtm/mcp-openapi-gateway-positioning.md)

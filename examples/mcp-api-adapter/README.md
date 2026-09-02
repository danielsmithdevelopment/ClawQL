# Example: scaffold OpenAPI + GraphQL + gRPC for MCP tools

This example shows two patterns:

1. **gRPC-native demo server** — `server.mjs` starts tools on gRPC and puts `mcp-api-adapter` in front (OpenAPI + GraphQL).
2. **Any-MCP wrap** — point the CLI at _any_ Streamable HTTP or stdio MCP server; the gateway scaffolds REST + GraphQL + local gRPC for you.

| Surface             | How                                              | Default (demo server)           |
| ------------------- | ------------------------------------------------ | ------------------------------- |
| **gRPC MCP**        | `mcp-grpc-transport` — `ListTools` / `CallTool`  | `127.0.0.1:50051`               |
| **OpenAPI on-ramp** | `mcp-api-adapter` — `POST /{toolName}` + Swagger | `http://127.0.0.1:8090`         |
| **GraphQL on-ramp** | same gateway — `POST /graphql` + GraphiQL        | `http://127.0.0.1:8090/graphql` |

Demo tools: `echo`, `add`, `greet`.

**User guide:** [`docs/mcp/mcp-api-adapter.md`](../../docs/mcp/mcp-api-adapter.md).

## Prerequisites

From the ClawQL repo root:

```bash
npm install
npm run build -w mcp-grpc-transport
npm run build -w mcp-api-adapter
```

## A. Demo server (gRPC upstream)

```bash
node examples/mcp-api-adapter/server.mjs
```

Optional env: `GRPC_PORT` (default `50051`), `OPENAPI_PORT` (default `8090`), `ENABLE_GRPC_REFLECTION`, `MCP_API_ADAPTER_API_KEY`.

## B. Wrap any MCP server (CLI)

`mcp-api-adapter` is **not on npm yet** — run the built bin from this repo:

```bash
# Streamable HTTP MCP already running somewhere:
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs --mcp-url http://127.0.0.1:8080/mcp \
  --listen 0.0.0.0:8090 --grpc-listen 127.0.0.1:50051

# Or spawn a stdio MCP package:
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

After the first npm publish, the same invocations work as `npx mcp-api-adapter …`.

## Call surfaces

```bash
node examples/mcp-api-adapter/demo-rest.mjs
node examples/mcp-api-adapter/demo-graphql.mjs
node examples/mcp-api-adapter/demo-grpc.mjs
node examples/mcp-api-adapter/demo-all.mjs   # parity check
node examples/mcp-api-adapter/clawql-with-trace.mjs   # live /mcp-ui/trace + shared inference JSONL
```

**Click-to-claim (third-party WebMCP → human UI):**

```bash
node examples/mcp-api-adapter/cloudflare-claim-server.mjs
open http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim
open http://127.0.0.1:8765/   # third-party WebMCP page
```

See [`cloudflare-claim/README.md`](cloudflare-claim/README.md).

**Docs Agent Lab /mcp-ui preset (Act 2):**

```bash
node examples/mcp-api-adapter/docs-agent-lab-server.mjs
open http://127.0.0.1:8091/mcp-ui/presets/agent-lab
```

Scaffolded HTMX multi-step UI for `docs_*` tools — not a static page on the docs site.

**PixelDrop smart-upload demo** (broken upload vs /mcp-ui fix):

```bash
cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765
# open http://127.0.0.1:8765/smart-upload-test-harness.html
node examples/mcp-api-adapter/pixeldrop/smoke-test.mjs
```

See [`pixeldrop/README.md`](pixeldrop/README.md).

```bash
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}' | jq .
open http://127.0.0.1:8090/docs
open http://127.0.0.1:8090/graphiql
```

## Positioning

OpenAPI + GraphQL are **on-ramps**. gRPC (`mcp-grpc-transport`) is the **production** path — see `info.x-clawql-grpc` in `/openapi.json`.

Design: [`docs/design/mcp-api-adapter.md`](../../docs/design/mcp-api-adapter.md).

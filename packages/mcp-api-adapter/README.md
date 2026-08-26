# mcp-api-adapter

**Standalone package:** point it at **any** MCP server (any language that speaks MCP) and instantly get **OpenAPI + GraphQL + Streamable HTTP `/mcp` + gRPC + WebSocket `/ws` + HTMX `/mcp-ui`** for the same tools — plus an optional generated CLI. Planned: **QR** (air-gap). The adapter itself is TypeScript (`npx`); the upstream is language-agnostic. No ClawQL install required.

Closest single-surface alternative: Python **[mcpo](https://github.com/open-webui/mcpo)** (OpenAPI only). Prefer this package when you need all shipped surfaces (plus planned QR) — see [Protocol Fabric](../../docs/mcp/protocol-fabric.md) and [`/mcp-ui`](../../docs/mcp/mcp-ui.md).

**npm status:** in-repo at `0.5.1` — **not published yet** (`npm view mcp-api-adapter` → 404). Use from-source until the first registry publish (listed under `localPackExtras` in `scripts/release/npm-publish-order.json`).

### From source (works today)

```bash
# From ClawQL repo root
npm ci
npm run build -w mcp-grpc-transport
npm run build -w mcp-api-adapter
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs --mcp-url http://127.0.0.1:8080/mcp
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs --stdio -- npx -y @modelcontextprotocol/server-everything
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs --grpc-address 127.0.0.1:50051
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

### After npm publish

```bash
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything
npx mcp-api-adapter --grpc-address 127.0.0.1:50051
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
           ├── WebSocket   JSON tool calls   · /ws
           ├── gen-cli     thin Node CLI (PrintingPress later)
           ├── QR stream   optical channel (planned)
           └── /mcp-ui     HTMX playground — Swagger UI for MCP
```

> Distinct from ClawQL’s **Agentic Gateway**. This package only adapts MCP tools onto APIs (including re-exporting MCP itself when useful).

| Doc        | Path                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| User guide | [`docs/mcp/mcp-api-adapter.md`](../../docs/mcp/mcp-api-adapter.md)       |
| Design     | [`docs/design/mcp-api-adapter.md`](../../docs/design/mcp-api-adapter.md) |
| Example    | [`examples/mcp-api-adapter/`](../../examples/mcp-api-adapter/)           |

## HTTP routes

| Path                   | Purpose                          |
| ---------------------- | -------------------------------- |
| `GET /docs`            | Swagger UI                       |
| `GET /openapi.json`    | OpenAPI 3.1                      |
| `POST /{toolName}`     | REST tool call                   |
| `POST /graphql`        | GraphQL                          |
| `GET /graphiql`        | GraphiQL                         |
| `POST/GET/DELETE /mcp` | Streamable HTTP MCP (same tools) |
| `WS /ws`               | WebSocket JSON tool calls        |
| `GET /mcp-ui`          | HTMX tool playground (auto-generated forms) |
| `POST /mcp-ui/execute/{toolName}` | Run a tool from the UI (urlencoded or multipart) |
| `GET /mcp-ui/progress/{jobId}` | SSE progress for long-running executes |
| `POST /mcp-ui/generate` | Create a multi-step custom form (JSON) |
| `GET /mcp-ui/custom/{slug}` | Render a generated multi-step form |
| `GET /tools`           | Catalog                          |
| `GET /healthz`         | Liveness                         |

Disable MCP with `--no-mcp`. Disable WebSocket with `--no-ws`. Disable `/mcp-ui` with `--no-mcp-ui`. Disable ATR catalog filtering with `--no-mcp-ui-atr-scoped`. Change paths with `--mcp-path` / `--ws-path` / `--mcp-ui-path`.

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

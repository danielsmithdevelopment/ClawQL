# mcp-api-adapter — six surfaces, one catalog

**Package:** [`mcp-api-adapter`](../../packages/mcp-api-adapter/) (`0.6.0+`)  
**Status:** Shipped in-repo · **npm not published yet** (`npm view mcp-api-adapter` → 404)  
**Essay:** [Five surfaces, one catalog](https://pragmaticvectors.com/posts/mcp-api-adapter-five-surfaces/)  
**Design:** [`docs/design/mcp-api-adapter.md`](../design/mcp-api-adapter.md)  
**Example:** [`examples/mcp-api-adapter/`](../../examples/mcp-api-adapter/)  
**Protocol Fabric:** [`protocol-fabric.md`](./protocol-fabric.md) (proven WS → CLI → REST → vault loop)

`mcp-api-adapter` wraps **any** MCP server — stdio, Streamable HTTP, or gRPC — and exposes **six API surfaces** from one tool catalog without changing the server. No ClawQL install required.

**Language-agnostic.** The adapter process is TypeScript (`npx mcp-api-adapter`); the upstream may be Python, Go, Rust, or any language that speaks MCP. Users do not write TypeScript to use it — same Node baseline as `npx clawql-mcp`.

> **Install note:** The package lives under [`packages/mcp-api-adapter`](../../packages/mcp-api-adapter/) and is listed in `localPackExtras` for the npm publish workflow, but the name is not on the registry yet — bare `npx mcp-api-adapter` fails until the first publish. Use the **from-source** commands below until then.

```text
Any MCP server
  ├─ stdio
  ├─ Streamable HTTP
  └─ gRPC
         │
         ▼
mcp-api-adapter
         │
         ├── POST /{toolName}     OpenAPI + Swagger at /docs
         ├── POST /graphql        GraphQL mutations + GraphiQL at /graphiql
         ├── /mcp                 Streamable HTTP re-export for IDE clients
         ├── :50051               gRPC (upstream or locally scaffolded)
         ├── /ws                  WebSocket tool-call surface
         └── gen-cli              Generated zero-dependency Node CLI
```

Point the adapter at one upstream. It calls `ListTools` at startup, builds the OpenAPI spec and GraphQL schema from each tool's `inputSchema`, and mounts the HTTP/WS/gRPC surfaces.

## The client fragmentation problem

MCP standardized how agents discover and call tools. Every other consumer still needs its own on-ramp.

| Consumer                        | Wants                                  |
| ------------------------------- | -------------------------------------- |
| Cloudflare Worker               | `POST /memory_recall` with a JSON body |
| OpenWebUI / model config panels | An OpenAPI URL                         |
| Enterprise GraphQL stacks       | A typed mutation per tool              |
| SREs / service mesh             | `grpcurl` on `:50051`                  |
| Cursor / Claude Desktop         | Streamable HTTP `/mcp`                 |
| Data / ops scripts              | A thin CLI                             |

The usual answer is a custom adapter per consumer — or Python **[mcpo](https://github.com/open-webui/mcpo)** (Open WebUI) for **OpenAPI/REST only**. **`mcp-api-adapter`** is the multi-surface option: OpenAPI + GraphQL + Streamable HTTP `/mcp` + gRPC + WebSocket + gen-cli from one MCP upstream. Prefer **mcpo** when Open WebUI users already expect that single REST surface; prefer the adapter when one REST facade is not enough.

Together with ClawQL Core (APIs → MCP), this is the **[Protocol Fabric](./protocol-fabric.md)** — MCP as the common IR in both directions.
>>>>>>> 19d2cfe7 (docs(mcp-api-adapter): language-agnostic upstream + mcpo positioning)

## Direction: MCP → APIs

ClawQL Core (`search` / `execute`) runs **OpenAPI → MCP**: it wraps REST/GraphQL/Discovery APIs and exposes them as MCP tools for agents. **`mcp-api-adapter`** runs the inverse: it wraps an MCP server and exposes the tool catalog outward as REST, GraphQL, gRPC, Streamable HTTP, and CLI for non-agent consumers.

Position this as the **OpenAPI on-ramp** or **MCP tools as REST/GraphQL** — not “the OpenAPI gateway,” which collides with ClawQL Core’s direction.

| Piece                                | Direction                             | Upstream                        | Consumer                                |
| ------------------------------------ | ------------------------------------- | ------------------------------- | --------------------------------------- |
| **ClawQL Core** `search` / `execute` | OpenAPI → MCP                         | REST / GraphQL / Discovery APIs | Agents                                  |
| **`mcp-api-adapter`**                | MCP → APIs                            | Any MCP server                  | Workers, REST, GraphQL, IDEs, mesh, CLI |
| **Custom sources**                   | MCP (and APIs) → ClawQL gateway index | Other MCP servers / APIs        | Agents talking to **one** ClawQL MCP    |

[Custom sources](../getting-started/custom-sources.md) registers upstream MCP servers **into** ClawQL. `mcp-api-adapter` exposes an MCP server **outward** to non-MCP clients.

## Quick start

### From source (works today)

```bash
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL
npm ci
npm run build -w mcp-grpc-transport
npm run build -w mcp-api-adapter

# Alias the CLI for the snippets below
alias mcp-api-adapter='node "$(pwd)/packages/mcp-api-adapter/bin/mcp-api-adapter.mjs"'

# Wrap a remote Streamable HTTP server
mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp

# Wrap a stdio package; expose /mcp for IDEs
mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything

# Front an existing gRPC MCP server
mcp-api-adapter --grpc-address 127.0.0.1:50051

# Generate a CLI from the tool catalog
mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

### After npm publish

Once `npm view mcp-api-adapter` succeeds, the same CLI is:

```bash
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything
npx mcp-api-adapter --grpc-address 127.0.0.1:50051
npx mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

Defaults: HTTP listen `0.0.0.0:8090`. Open `/docs`, try `POST /{toolName}`, open `/graphiql`, point an IDE at `/mcp`, and run `grpcurl -plaintext 127.0.0.1:50051 list`.

### Streamable HTTP with explicit binds

```bash
mcp-api-adapter \
  --mcp-url http://127.0.0.1:8080/mcp \
  --listen 0.0.0.0:8090 \
  --grpc-listen 127.0.0.1:50051
```

```bash
curl -s -X POST http://127.0.0.1:8090/echo \
  -H 'content-type: application/json' \
  -d '{"message":"hi"}'

curl -s http://127.0.0.1:8090/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation { echo(message: \"hi\") }"}'

grpcurl -plaintext 127.0.0.1:50051 list
```

Everything after `--stdio --` is the child command. The gateway keeps the stdio session open, serves REST/GraphQL/`/mcp`, and (unless `--no-grpc`) starts a local gRPC bridge that delegates into the same session.

With `--grpc-address`, no second gRPC server is started; `/openapi.json` advertises the upstream address in `info.x-clawql-grpc`.

## The six surfaces

### OpenAPI — `POST /{toolName}`

Every tool becomes a named REST route. The body is JSON matching the tool's `inputSchema`. Responses prefer MCP `structuredContent`, else parse single text content as JSON, else return a `{ content, text, isError }` envelope.

Swagger UI lives at `/docs`. Every path includes `x-clawql-grpc` extensions (gRPC endpoint, proto URL, example `grpcurl`). REST is an on-ramp — `/docs` points developers at gRPC for production use.

### GraphQL — mutations per tool

Each tool gets a typed mutation derived from `inputSchema`. GraphiQL is at `/graphiql`. Schema includes `callTool(name: String!, arguments: JSON): ToolResult` for dynamic callers.

### `/mcp` — Streamable HTTP re-export

Re-exports the upstream catalog as standard Streamable HTTP MCP:

- **stdio → remote IDE:** wrap a local package; give Cursor/Claude `https://your-host/mcp` without SSH tunnels.
- **gRPC → MCP SDK:** `/mcp` forwards into `CallTool` over gRPC, normalizing protobuf content oneofs into `{ type: "text", text }` blocks so MCP SDK validation passes (**v0.5.1**).

### gRPC — the production path

If the upstream is already gRPC, REST and GraphQL forward into it. If the upstream is stdio or Streamable HTTP, the adapter starts a local [`mcp-grpc-transport`](../../packages/mcp-grpc-transport/) server that delegates into the session.

Either way, `:50051` is available for grpcurl, mesh routing, and protobuf clients. `model_context_protocol.Mcp/CallTool` takes a tool name and `google.protobuf.Struct` arguments. Argument schemas live in OpenAPI and GraphQL — clients do not need generated stubs.

Google proposed gRPC as a first-class MCP transport in February 2026. ClawQL ships the production TypeScript implementation as **`mcp-grpc-transport`**; the adapter makes it reachable from clients that cannot speak gRPC natively.

### `/ws` — WebSocket tool calls

Persistent JSON tool-call channel (default path `/ws`; disable with `--no-ws`):

```json
{ "id": "1", "tool": "memory_ingest", "arguments": { "title": "…", "insights": "…" } }
```

or MCP-shaped `{ "method": "tools/call", "params": { "name": "…", "arguments": { … } } }`. Replies `{ "id", "ok", "result" | "error" }`. Prefer WebSocket for long-lived clients and DO hibernation; keep Streamable HTTP `/mcp` for IDE clients that cannot speak WS. **gen-cli** remains build-time (disk), not a DO runtime surface.

Protocol Fabric loop (WS → execute CLI source → gen-cli → `memory_ingest`): see [`protocol-fabric.md`](./protocol-fabric.md) and `scripts/dev/smoke-protocol-fabric-loop.sh`.

### gen-cli — generated CLI

`gen-cli` reads the catalog and generates a thin Node CLI with one subcommand per tool. Arguments map from `inputSchema`. The CLI POSTs to the REST surface. PrintingPress will handle signed binary distribution when ready.

```bash
mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything

./my-cli echo --message "hello"
```

## What shipped

| Version | What landed                                             |
| ------- | ------------------------------------------------------- |
| 0.3.x   | Any MCP upstream + OpenAPI + GraphQL + gRPC scaffold    |
| 0.4.0   | Renamed from `mcp-openapi-gateway` to `mcp-api-adapter` |
| 0.5.0   | Streamable HTTP `/mcp` + `gen-cli`                      |
| 0.5.1   | gRPC → `/mcp` content normalization for MCP SDK clients |
| 0.6.0   | **WebSocket `/ws`** tool-call surface (sixth surface)   |

## When to use it

Use the adapter when you have a working MCP server and need Workers, OpenAPI panels, GraphQL, IDEs, mesh, or CLI access without writing glue per consumer.

A custom adapter makes more sense when you need a surface this package does not have, significant custom auth, or the generality works against you.

## CLI reference

| Flag / env                                      | Meaning                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `--mcp-url`                                     | Streamable HTTP MCP URL                        |
| `--stdio -- <cmd…>`                             | Spawn MCP over stdio                           |
| `--grpc-address` / `CLAWQL_MCP_GRPC_ADDR`       | Upstream gRPC `host:port`                      |
| `--grpc-host` / `--grpc-port`                   | Alternate gRPC address pieces                  |
| `--listen` / `MCP_API_ADAPTER_LISTEN`           | HTTP bind (default `0.0.0.0:8090`)             |
| `--grpc-listen` / `MCP_API_ADAPTER_GRPC_LISTEN` | Scaffolded gRPC bind (default `127.0.0.1:0`)   |
| `--no-grpc`                                     | Do not scaffold local gRPC (stdio/HTTP only)   |
| `--mcp-path` / `MCP_API_ADAPTER_MCP_PATH`       | Streamable HTTP path (default `/mcp`)          |
| `--no-mcp`                                      | Disable `/mcp`                                 |
| `--ws-path` / `MCP_API_ADAPTER_WS_PATH`         | WebSocket path (default `/ws`)                 |
| `--no-ws`                                       | Disable WebSocket surface                      |
| `--api-key` / `MCP_API_ADAPTER_API_KEY`         | Require `X-API-Key` or `Authorization: Bearer` |
| `--refresh-ms`                                  | Re-`ListTools` poll interval                   |
| `--title`                                       | Swagger / GraphiQL title                       |

Legacy env `MCP_OPENAPI_GATEWAY_*` is still accepted. Exactly one upstream mode is required (`--mcp-url`, `--stdio`, or `--grpc-address` / env default).

## Programmatic API

```ts
import { startMcpApiAdapter } from "mcp-api-adapter";

const adapter = await startMcpApiAdapter({
  upstream: { kind: "http", url: "http://127.0.0.1:8080/mcp" },
  host: "0.0.0.0",
  port: 8090,
  grpcListen: "127.0.0.1:50051",
  apiKey: process.env.MCP_API_ADAPTER_API_KEY,
});

// adapter.url — OpenAPI + GraphQL
// adapter.grpcAddress — upstream or scaffolded gRPC
// adapter.getCatalog() — tools + surfaces + upstreamKind
await adapter.close();
```

Upstream union:

```ts
type UpstreamOptions =
  | { kind: "grpc"; address: string; protocolVersion?: string }
  | { kind: "http"; url: string }
  | {
      kind: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
```

Compatibility: `startMcpOpenApiGateway({ grpcAddress })` ≡ `startMcpApiAdapter({ upstream: { kind: "grpc", address }, grpcListen: false })`.

## HTTP surface map

| Method / path                 | Role                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `GET /healthz`                | Liveness (`upstreamKind`, `surfaces`, `grpcAddress`) |
| `GET /tools`                  | Full catalog JSON                                    |
| `GET /openapi.json`           | OpenAPI 3.1 from tool `inputSchema`                  |
| `GET /docs`                   | Swagger UI                                           |
| `POST /{toolName}`            | Invoke tool; JSON body = tool arguments              |
| `POST /graphql`               | GraphQL endpoint                                     |
| `GET /graphiql`               | GraphiQL IDE                                         |
| `GET /graphql/schema.graphql` | SDL                                                  |
| Streamable HTTP `/mcp`        | MCP re-export for IDE / SDK clients                  |
| WebSocket `/ws`               | Persistent JSON tool calls                           |

## GraphQL conventions

- **`Query.tools` / `Query.health`** — catalog + health
- **`Mutation.<toolName>(…)`** — one field per tool; top-level JSON Schema properties become GraphQL args when GraphQL-safe
- **`Mutation.callTool(name, args)`** — generic escape hatch for awkward schemas

## Auth

When auth is set via `--api-key` (or `MCP_API_ADAPTER_API_KEY` / legacy `MCP_OPENAPI_GATEWAY_API_KEY`), all routes except `/healthz` require:

- `X-API-Key: <key>`, or
- `Authorization: Bearer <key>`

gRPC auth is not handled here — use mesh/mTLS / interceptors on `mcp-grpc-transport` for production gRPC.

## Relationship to other ClawQL pieces

| Piece                                                      | Role                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| **[Protocol Fabric](./protocol-fabric.md)**                | Named claim for Core + adapter (any protocol ↔ any); proven loop |
| **`mcp-api-adapter`**                                      | MCP → OpenAPI + GraphQL + `/mcp` + gRPC + `/ws` + gen-cli        |
| **ClawQL `search` / `execute`**                            | OpenAPI → MCP tools (inverse)                                    |
| **[Custom sources](../getting-started/custom-sources.md)** | Register other MCP servers **into** the ClawQL gateway           |
| **`mcp-grpc-transport`**                                   | Production TypeScript MCP gRPC transport                         |
| **Panguard bridge**                                        | Policy / JWT ATR in front of MCP                                 |
| **[ClawQL Streams](../streams/clawql-streams.md)** (draft) | Event-driven agents; WebSocket sources into Core                 |
>>>>>>> 508459b5 (docs(mcp-api-adapter): cross-link ClawQL Streams draft)

## Troubleshooting

| Symptom                        | Check                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `Provide exactly one upstream` | Only one of `--mcp-url` / `--stdio` / `--grpc-address`                             |
| No gRPC surface for HTTP/stdio | Ensure `--no-grpc` is unset; gateway sets `ENABLE_GRPC` while scaffolding          |
| Empty GraphQL args             | Upstream `ListTools` `inputSchema` missing/empty — use `callTool(name, args: {…})` |
| `502 upstream CallTool failed` | Upstream down, wrong URL, or tool threw `isError`                                  |

## Further reading

- Essay: [Five surfaces, one catalog](https://pragmaticvectors.com/posts/mcp-api-adapter-five-surfaces/)
- Package README: [`packages/mcp-api-adapter/README.md`](../../packages/mcp-api-adapter/README.md)
- Design & non-goals: [`docs/design/mcp-api-adapter.md`](../design/mcp-api-adapter.md)
- GTM positioning: [`docs/gtm/mcp-api-adapter-positioning.md`](../gtm/mcp-api-adapter-positioning.md)
- Protocol Fabric (proven loop): [`docs/mcp/protocol-fabric.md`](./protocol-fabric.md)
- ClawQL Streams (draft): [`docs/streams/clawql-streams.md`](../streams/clawql-streams.md)
- Earlier post: [MCP tools as APIs](https://pragmaticvectors.com/posts/mcp-tools-as-apis/)
- gRPC transport: [`packages/mcp-grpc-transport`](../../packages/mcp-grpc-transport/)
- Local smoke: [`scripts/dev/smoke-mcp-api-adapter.sh`](../../scripts/dev/smoke-mcp-api-adapter.sh) · [`scripts/dev/smoke-protocol-fabric-loop.sh`](../../scripts/dev/smoke-protocol-fabric-loop.sh)
- Protocol Fabric / event loop (draft): [`docs/streams/clawql-streams.md`](../streams/clawql-streams.md)
>>>>>>> 19d2cfe7 (docs(mcp-api-adapter): language-agnostic upstream + mcpo positioning)

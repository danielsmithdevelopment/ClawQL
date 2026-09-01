---
canonical: https://pragmaticvectors.com/posts/mcp-api-adapter/
slug: mcp-api-adapter
meta-description: mcp-api-adapter wraps any MCP server and exposes eight API surfaces from one tool catalog — MCP, OpenAPI, GraphQL, gRPC, CLI, WebSocket, QR, and /mcp-ui — without changing the server.
meta-og:title: Eight Surfaces, One Catalog · PragmaticVectors
meta-og:url: https://pragmaticvectors.com/posts/mcp-api-adapter/
---

Architecture · August 2026 · ~14 min read

# Eight Surfaces, One Catalog

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

`mcp-api-adapter` wraps any MCP server and exposes **eight** API surfaces from one tool catalog without changing the server. Six ship today in `0.6.0`. The seventh — QR stream — is the air-gap surface. The eighth — `/mcp-ui` — is Swagger UI for MCP: HTMX forms auto-scaffolded from `inputSchema`, embedded in the adapter with zero config. Here is why that shape matters.

- [MCP](https://pragmaticvectors.com/tags/mcp)
- [Architecture](https://pragmaticvectors.com/tags/architecture)
- [Protocol Fabric](https://pragmaticvectors.com/tags/protocol-fabric)
- [Air Gap](https://pragmaticvectors.com/tags/air-gap)

_Earlier draft of this post lived at `/posts/mcp-api-adapter-five-surfaces/` and covered five surfaces (through gen-cli). Canonical slug is now `/posts/mcp-api-adapter/`. WebSocket landed as the sixth in `0.6.0`. QR is the planned seventh; `/mcp-ui` the planned eighth. Redirect the old five-surfaces URL here._

---

## The client fragmentation problem

MCP standardized how agents discover and call tools. That is good. What it did not standardize is how every other kind of consumer reaches those tools.

A Cloudflare Worker wants `POST /memory_recall` with a JSON body. An OpenWebUI instance wants an OpenAPI URL. A GraphQL client wants a typed mutation. An SRE wants `grpcurl` on the mesh. An IDE wants Streamable HTTP `/mcp`. A data team wants a thin CLI. A Durable Object wants a hibernatable WebSocket. A regulated auditor wants a camera pointed at a screen. An operator who does not speak MCP wants **forms and buttons in a browser**.

These are not obscure requirements. They cover most of the consumers you will encounter when you ship an MCP server into a real organization — including the ones that must not touch a network, and the ones who should not need Postman.

The current answer is: write a custom adapter for each one. Or use Python [mcpo](https://github.com/open-webui/mcpo) for the OpenAPI case and figure out the rest yourself.

`mcp-api-adapter` is the TypeScript answer for all eight.

---

## One process, eight surfaces

```text
Any MCP server
  ├─ stdio
  ├─ Streamable HTTP
  └─ gRPC
         │
         ▼
mcp-api-adapter
         │
         ├── /mcp                 Streamable HTTP re-export for IDE / MCP SDK clients
         ├── POST /{toolName}     OpenAPI + Swagger at /docs
         ├── POST /graphql        GraphQL mutations + GraphiQL at /graphiql
         ├── :50051               gRPC (upstream or locally scaffolded)
         ├── gen-cli              Generated zero-dependency Node CLI
         ├── /ws                  WebSocket JSON tool calls
         ├── QR stream            Optical channel (planned) — HDMI / camera / thermal
         └── /mcp-ui              HTMX playground (planned) — Swagger UI for MCP
```

Point the adapter at one upstream. It calls `ListTools` at startup, builds OpenAPI, GraphQL, and (planned) `/mcp-ui` forms from each tool’s `inputSchema`, and mounts the network surfaces. QR reuses the same catalog — it changes the **wire**, not the tools. `/mcp-ui` reuses the same catalog — it changes the **audience**, not the tools.

```bash
# Wrap a remote Streamable HTTP server
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp

# Wrap a stdio package, expose everything including /mcp for IDEs
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything

# Front an existing gRPC MCP server
npx mcp-api-adapter --grpc-address 127.0.0.1:50051

# Generate a CLI from the tool catalog
npx mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything

# Planned: open http://127.0.0.1:8090/mcp-ui for the form playground
# Planned: unidirectional QR stream of tool results (air-gap)
```

No ClawQL install required for the six shipped surfaces. Works against any MCP server.

---

## The eight surfaces, one by one

### 1. MCP — Streamable HTTP `/mcp`

This surface re-exports the upstream tool catalog as a standard MCP Streamable HTTP endpoint.

Use case: you have a stdio-only local package and you want Cursor or Claude Desktop to reach it remotely without SSH tunnels. Wrap it with the adapter. Give the IDE `https://your-host/mcp`.

It also covers the reverse: you have a gRPC-only production server and you want an MCP SDK client in CI to call it. The `/mcp` surface forwards into `CallTool` over gRPC, normalizing protobuf content oneofs into `{ type: "text", text }` blocks so MCP SDK validation passes. That normalization shipped in **v0.5.1**.

MCP stays first-class. The adapter does not demote the protocol — it multiplies who can reach the same catalog.

### 2. OpenAPI — `POST /{toolName}`

Every tool becomes a named REST route. The body is JSON matching the tool’s `inputSchema`. The response collapses the MCP content array to JSON, preferring `structuredContent` if present, parsing text as JSON if possible, otherwise returning the content envelope.

Swagger UI lives at `/docs`. Every path in the OpenAPI spec includes `x-clawql-grpc` extensions that document the gRPC endpoint, the proto URL, and an example `grpcurl` command. A developer landing on `/docs` sees the REST API and immediately sees how to reach gRPC directly. The REST surface is an on-ramp, not a destination.

### 3. GraphQL — mutations per tool

The GraphQL surface gets less attention in most MCP discussions. It matters. A lot of enterprise tooling is GraphQL-native. Having a mutation for each tool — with typed arguments derived from `inputSchema` — means those teams do not have to learn MCP to call your server’s tools.

GraphiQL lives at `/graphiql`. The schema includes a generic `callTool(name: String!, arguments: JSON): ToolResult` escape hatch for clients that want to call tools dynamically without knowing the schema in advance.

### 4. gRPC — the production path

If the upstream is already gRPC, REST and GraphQL calls forward into it. If the upstream is stdio or Streamable HTTP, the adapter starts a local [`mcp-grpc-transport`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport) server that delegates into the session.

Either way, `:50051` is available for grpcurl, service mesh routing, and any client that wants to speak protobuf. The `model_context_protocol.Mcp/CallTool` RPC takes a tool name and `google.protobuf.Struct` arguments. The schema for each tool’s arguments is in the OpenAPI spec and the GraphQL schema — clients do not need generated stubs.

Google submitted a formal proposal to add gRPC as a first-class MCP transport in February 2026. ClawQL ships the production TypeScript implementation as `mcp-grpc-transport`. The adapter makes it accessible from every client that cannot speak gRPC natively.

### 5. CLI — `gen-cli`

`gen-cli` reads the tool catalog and generates a thin Node CLI with one subcommand per tool. Arguments map directly from the tool’s `inputSchema`. The CLI POSTs to the REST surface. PrintingPress will handle signed binary distribution when that is ready.

```bash
npx mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything

./my-cli echo --message "hello"
# → { content: [{ type: "text", text: "hello" }] }
```

Ops scripts, CI steps, and “I just need to call one tool from bash” all land here.

### 6. WebSocket — `/ws`

Shipped in **v0.6.0** as the sixth surface. Persistent JSON tool-call channel (default path `/ws`; disable with `--no-ws`):

```json
{ "id": "1", "tool": "memory_ingest", "arguments": { "title": "…", "insights": "…" } }
```

or MCP-shaped `{ "method": "tools/call", "params": { "name": "…", "arguments": { … } } }`. Replies `{ "id", "ok", "result" | "error" }`.

Prefer WebSocket for long-lived clients and Durable Object hibernation. Keep Streamable HTTP `/mcp` for IDE clients that cannot speak WS. **gen-cli** remains build-time (disk), not a DO runtime surface.

This is also the surface that closes the [Protocol Fabric](https://docs.clawql.com/mcp/protocol-fabric) loop cleanly: WS → execute a CLI custom source → gen-cli → `memory_ingest` — smoke-tested in-repo.

### 7. QR — optical stream (planned)

The first six surfaces assume a network. The seventh does not.

[QR stream transport](https://docs.clawql.com/streams/clawql-qr-stream-transport) encodes MCP traffic (and Streams events) as a sequence of QR frames — CBOR + zstd, Merkle-chained, HMAC’d, optionally bound to a TEE attestation. A display shows frames; a camera scans them. Unidirectional by default. Bidirectional (two screens, two cameras) for full request/response when you need interactive MCP without a wire.

Why this belongs in the adapter, not as a one-off:

- **Same catalog.** Tool names and schemas do not fork for air-gap deployments.
- **Structural air gap.** The channel cannot receive instructions. Network compromise cannot rewrite what the screen shows.
- **Streams integration.** `sourceType: "qr"` turns a camera into an event source.
- **TEE audit export.** Same frame family as clawql-tee air-gap audit.

Status: **spec’d**; not in the `0.6.0` binary yet.

### 8. `/mcp-ui` — Swagger UI for MCP (planned)

Swagger UI solved browser exploration for REST. Nobody shipped the equivalent **inside** an MCP adapter — automatic, zero-config, no separate playground product.

`/mcp-ui` takes the same `ListTools` catalog that builds `/docs` and `/graphiql` and renders **HTMX forms**: one card per tool, fields from `inputSchema`, submit posts to `/mcp-ui/execute/{toolName}`, result fragment renders inline. Next actions can travel in the HTML (HATEOAS) — “ingest this finding,” “search again” — without the human memorizing the API.

```text
GET /mcp-ui → tool cards
  └─ form from inputSchema
       └─ hx-post /mcp-ui/execute/{tool}
            └─ result + next-action links
```

Standalone MCP playgrounds and SEP-1865 MCP Apps exist. They require you to go somewhere else, install something else, or author rich UI resources. `/mcp-ui` is just there — the same way `/docs` is just there.

The ClawQL-specific multiplier: Core ingests **any** API (REST, GraphQL, gRPC, CLI, WebSocket) into MCP. The adapter multiplies surfaces. `/mcp-ui` makes every connected source human-navigable in one browser. A new teammate opens one URL and can call Salesforce, GitHub, internal gRPC, and legacy REST through forms — without knowing the original protocols.

Draft: [docs/mcp/mcp-ui.md](https://docs.clawql.com/mcp/mcp-ui). Proof pattern already in ClawQL: payments credits mini UI (`/credits/*` HTMX fragments).

---

## The direction distinction

There are two directions in the ClawQL ecosystem. They are easily confused.

**ClawQL Core** goes **OpenAPI → MCP**. Agents use `search()` to discover operations across hundreds of provider APIs and `execute()` to call them. The upstream is a REST or GraphQL API. The consumer is an agent.

**`mcp-api-adapter`** goes **MCP → APIs**. The upstream is an MCP server. The consumers are Workers, REST clients, GraphQL services, IDEs, mesh infrastructure, CLI scripts, WebSocket clients, air-gapped scanners — and humans with a browser at `/mcp-ui`.

Together that is the **Protocol Fabric**: MCP as the common intermediate representation both directions. Streams adds the event loop on top. TEE / QR close the physical gap. `/mcp-ui` closes the human gap.

In marketing, `mcp-api-adapter` is the “OpenAPI on-ramp,” the “GraphQL on-ramp,” “MCP tools as REST/GraphQL,” or “eight surfaces, one catalog.” Not “the OpenAPI gateway” — that phrase collides with ClawQL Core’s inverse direction.

---

## What shipped (and what is next)

| Version   | What landed                                                      |
| --------- | ---------------------------------------------------------------- |
| 0.3.x     | Any MCP upstream + OpenAPI + GraphQL + gRPC scaffold             |
| 0.4.0     | Renamed from `mcp-openapi-gateway` to `mcp-api-adapter`          |
| 0.5.0     | Streamable HTTP `/mcp` + `gen-cli`                               |
| 0.5.1     | gRPC → `/mcp` content normalization for MCP SDK clients          |
| **0.6.0** | **WebSocket `/ws`** (sixth surface) + Protocol Fabric loop smoke |
| Next      | **QR stream** (seventh) · **`/mcp-ui`** (eighth)                 |

Six surfaces are live in-repo today (`mcp-api-adapter@0.6.0`; npm publish on its own cadence). QR and `/mcp-ui` are the drafts that extend the fabric past the network and past the developer-only IDE.

---

## When to use mcp-api-adapter vs writing your own adapter

**Write your own when:** you need significant custom auth logic, or you are building something where the adapter’s generality works against you.

**Use the adapter when:** you have a working MCP server and you want to expose it to clients that do not speak MCP — or cannot use a network — or should not need a custom frontend — without writing glue code per consumer type.

The five-minute path to verifying the shipped surfaces with your server:

```bash
npx mcp-api-adapter --stdio -- your-mcp-server
# Open http://127.0.0.1:8090/docs
# Try POST /your_tool_name with the right body
# Open http://127.0.0.1:8090/graphiql and run a mutation
# Point an IDE at http://127.0.0.1:8090/mcp
# grpcurl -plaintext 127.0.0.1:50051 list
# Connect a WS client to ws://127.0.0.1:8090/ws
# Planned: open http://127.0.0.1:8090/mcp-ui
```

---

## Further reading

- User guide — [docs/mcp/mcp-api-adapter.md](https://docs.clawql.com/mcp/mcp-api-adapter)
- `/mcp-ui` draft — [docs/mcp/mcp-ui.md](https://docs.clawql.com/mcp/mcp-ui)
- Protocol Fabric — [docs/mcp/protocol-fabric.md](https://docs.clawql.com/mcp/protocol-fabric)
- QR stream transport (draft) — [docs/streams/clawql-qr-stream-transport.md](https://docs.clawql.com/streams/clawql-qr-stream-transport)
- TEE air-gap audit (draft) — [docs/streams/clawql-tee-airgap-audit.md](https://docs.clawql.com/streams/clawql-tee-airgap-audit)
- ClawQL Streams (draft) — [docs/streams/clawql-streams.md](https://docs.clawql.com/streams/clawql-streams)
- Design — [docs/design/mcp-api-adapter.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-api-adapter.md)
- gRPC transport — [mcp-grpc-transport](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport)
- Earlier post — [The Week Everything Converged](https://pragmaticvectors.com/posts/openbench-convergence-week/)

---

_Draft for pragmaticvectors.com — publish at `/posts/mcp-api-adapter/`. Redirect `/posts/mcp-api-adapter-five-surfaces/` → `/posts/mcp-api-adapter/`._

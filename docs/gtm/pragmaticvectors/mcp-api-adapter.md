---
canonical: https://pragmaticvectors.com/posts/mcp-api-adapter/
slug: mcp-api-adapter
meta-description: mcp-api-adapter wraps any MCP server and exposes seven API surfaces from one tool catalog — MCP, OpenAPI, GraphQL, gRPC, CLI, WebSocket, and QR — without changing the server.
meta-og:title: Seven Surfaces, One Catalog · PragmaticVectors
meta-og:url: https://pragmaticvectors.com/posts/mcp-api-adapter/
---

Architecture · August 2026 · ~12 min read

# Seven Surfaces, One Catalog

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

`mcp-api-adapter` wraps any MCP server and exposes **seven** API surfaces from one tool catalog without changing the server. Six ship today in `0.6.0`. The seventh — QR stream — is the air-gap surface: optical, Merkle-verified, network-optional. Here is why that shape matters, what shipped through WebSocket, and how the whole thing still funnels toward gRPC when you have a network.

- [MCP](https://pragmaticvectors.com/tags/mcp)
- [Architecture](https://pragmaticvectors.com/tags/architecture)
- [Protocol Fabric](https://pragmaticvectors.com/tags/protocol-fabric)
- [Air Gap](https://pragmaticvectors.com/tags/air-gap)

_Earlier draft of this post lived at `/posts/mcp-api-adapter-five-surfaces/` and covered five surfaces (through gen-cli). Canonical slug is now `/posts/mcp-api-adapter/`. WebSocket landed as the sixth in `0.6.0`. QR stream is the planned seventh — same catalog, physical channel. Redirect the old five-surfaces URL here._

---

## The client fragmentation problem

MCP standardized how agents discover and call tools. That is good. What it did not standardize is how every other kind of consumer reaches those tools.

A Cloudflare Worker wants `POST /memory_recall` with a JSON body. An OpenWebUI instance wants an OpenAPI URL it can load into its model configuration panel. A GraphQL client wants a typed mutation. An SRE wants to `grpcurl` the service directly from the mesh. An IDE like Cursor or Claude Desktop wants a Streamable HTTP `/mcp` endpoint. A data team wants a thin CLI that runs in a bash script. A long-lived Durable Object wants a hibernatable WebSocket. A regulated auditor standing in front of an air-gapped rack wants a camera pointed at a screen — not a VPN into the production VPC.

These are not obscure requirements. They cover most of the consumers you will encounter when you ship an MCP server into a real organization — including the ones that **must not** touch a network.

The current answer is: write a custom adapter for each one. Or use Python [mcpo](https://github.com/open-webui/mcpo) for the OpenAPI case and figure out the rest yourself.

`mcp-api-adapter` is the TypeScript answer for all seven.

---

## One process, seven surfaces

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
         └── QR stream            Optical channel (planned) — HDMI / camera / thermal
```

Point the adapter at one upstream. It calls `ListTools` at startup, builds the OpenAPI spec and GraphQL schema from each tool’s `inputSchema`, and mounts the network surfaces. The QR surface reuses the same catalog — it changes the **wire**, not the tools.

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

# Planned: unidirectional QR stream of tool results (air-gap)
# npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp \
#   --qr-output hdmi --qr-mode stream --qr-frame-interval-ms 500
```

No ClawQL install required for the six shipped surfaces. Works against any MCP server.

---

## The seven surfaces, one by one

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

```text
Air-gapped MCP / TEE / voting machine
  │  QR frames (optical, one-way)
  ▼
Camera → mcp-api-adapter / clawql-streams
  │
  └─ same tool catalog · WORM · optional Agent DO
```

Why this belongs in the adapter, not as a one-off:

- **Same catalog.** Tool names and schemas do not fork for air-gap deployments.
- **Structural air gap.** The channel cannot receive instructions. Network compromise cannot rewrite what the screen shows.
- **Streams integration.** `sourceType: "qr"` turns a camera into an event source — significance filter, Agent DO, vault ingest — without the air-gapped side ever accepting inbound connections.
- **TEE audit export.** The same frame format as [clawql-tee air-gap audit](https://docs.clawql.com/streams/clawql-tee-airgap-audit) — Merkle root, attestation, thermal printer as a physical artifact.

QR is niche. It is also the niche that regulated enterprise, government auditors on-site, and election/air-gap workloads actually have. Nobody else ships MCP over a physically verifiable optical channel.

Status: **spec’d** in ClawQL Streams / TEE docs; not in the `0.6.0` binary yet. The six network surfaces are production path today.

---

## The direction distinction

There are two directions in the ClawQL ecosystem. They are easily confused.

**ClawQL Core** goes **OpenAPI → MCP**. Agents use `search()` to discover operations across hundreds of provider APIs and `execute()` to call them. The upstream is a REST or GraphQL API. The consumer is an agent.

**`mcp-api-adapter`** goes **MCP → APIs**. The upstream is an MCP server. The consumers are Workers, REST clients, GraphQL services, IDEs, mesh infrastructure, CLI scripts, WebSocket clients — and, with QR, air-gapped scanners.

Together that is the **Protocol Fabric**: MCP as the common intermediate representation both directions. Streams adds the event loop on top. TEE / QR close the case where the fabric must cross a physical gap.

In marketing, `mcp-api-adapter` is the “OpenAPI on-ramp,” the “GraphQL on-ramp,” “MCP tools as REST/GraphQL,” or “seven surfaces, one catalog.” Not “the OpenAPI gateway” — that phrase collides with ClawQL Core’s inverse direction.

---

## What shipped (and what is next)

| Version   | What landed                                                                  |
| --------- | ---------------------------------------------------------------------------- |
| 0.3.x     | Any MCP upstream + OpenAPI + GraphQL + gRPC scaffold                         |
| 0.4.0     | Renamed from `mcp-openapi-gateway` to `mcp-api-adapter`                      |
| 0.5.0     | Streamable HTTP `/mcp` + `gen-cli`                                           |
| 0.5.1     | gRPC → `/mcp` content normalization for MCP SDK clients                      |
| **0.6.0** | **WebSocket `/ws`** (sixth surface) + Protocol Fabric loop smoke             |
| Next      | **QR stream** (seventh surface) — optical encode/decode, Streams `qr` source |

Six surfaces are live in-repo today (`mcp-api-adapter@0.6.0`; npm publish on its own cadence). QR is the draft that extends the fabric past the network.

---

## When to use mcp-api-adapter vs writing your own adapter

**Write your own when:** you need significant custom auth logic, or you are building something where the adapter’s generality works against you.

**Use the adapter when:** you have a working MCP server and you want to expose it to clients that do not speak MCP — or cannot use a network — without writing glue code per consumer type.

The five-minute path to verifying the shipped surfaces with your server:

```bash
npx mcp-api-adapter --stdio -- your-mcp-server
# Open http://127.0.0.1:8090/docs
# Try POST /your_tool_name with the right body
# Open http://127.0.0.1:8090/graphiql and run a mutation
# Point an IDE at http://127.0.0.1:8090/mcp
# grpcurl -plaintext 127.0.0.1:50051 list
# Connect a WS client to ws://127.0.0.1:8090/ws
```

---

## Further reading

- User guide — [docs/mcp/mcp-api-adapter.md](https://docs.clawql.com/mcp/mcp-api-adapter)
- Protocol Fabric — [docs/mcp/protocol-fabric.md](https://docs.clawql.com/mcp/protocol-fabric)
- QR stream transport (draft) — [docs/streams/clawql-qr-stream-transport.md](https://docs.clawql.com/streams/clawql-qr-stream-transport)
- TEE air-gap audit (draft) — [docs/streams/clawql-tee-airgap-audit.md](https://docs.clawql.com/streams/clawql-tee-airgap-audit)
- ClawQL Streams (draft) — [docs/streams/clawql-streams.md](https://docs.clawql.com/streams/clawql-streams)
- Design — [docs/design/mcp-api-adapter.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-api-adapter.md)
- gRPC transport — [mcp-grpc-transport](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport)
- Earlier post — [The Week Everything Converged](https://pragmaticvectors.com/posts/openbench-convergence-week/)

---

_Draft for pragmaticvectors.com — publish at `/posts/mcp-api-adapter/`. Redirect `/posts/mcp-api-adapter-five-surfaces/` → `/posts/mcp-api-adapter/`._

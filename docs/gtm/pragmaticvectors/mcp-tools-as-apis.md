---
canonical: https://pragmaticvectors.com/posts/mcp-tools-as-apis/
meta-description: Point mcp-api-adapter at any MCP server and get OpenAPI, GraphQL, Streamable HTTP /mcp, and gRPC for the same tools — a TypeScript on-ramp that funnels production traffic to mcp-grpc-transport.
---

Architecture · August 4, 2026 · ~8 min read

# MCP tools as APIs — and gRPC underneath

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

Point `mcp-api-adapter` at any MCP server and instantly get REST, GraphQL, Streamable HTTP `/mcp`, and gRPC for the same tools. Here is why that shape matters, how the adapter works, and how it differs from ClawQL Core.

- [MCP](https://pragmaticvectors.com/tags/mcp)
- [OpenAPI](https://pragmaticvectors.com/tags/openapi)
- [gRPC](https://pragmaticvectors.com/tags/grpc)
- [Agents](https://pragmaticvectors.com/tags/agents)

---

## The mismatch

MCP won the _tool catalog_ war. Agents discover capabilities with `ListTools` and invoke them with `CallTool`. Local servers speak **stdio**; remote ones speak **Streamable HTTP**. That is fine for Cursor, Claude Desktop, and other MCP-native clients.

It is awkward for everyone else.

A Cloudflare Worker wants `POST /memory_recall` with a JSON body. OpenWebUI wants an OpenAPI URL. A GraphQL client wants a mutation. An SRE wants `grpcurl` against a stable protobuf service in the mesh. None of those consumers want to manage MCP session semantics just to call a tool by name.

Python [mcpo](https://github.com/open-webui/mcpo) already covers part of this story — MCP → OpenAPI, stdio-centric, FastAPI-first. The gap we care about is different: **TypeScript-native**, **transport-agnostic on the left**, and **explicitly funneling production traffic to gRPC** on the right.

Google has proposed gRPC as a first-class MCP transport. ClawQL already ships the production TypeScript implementation as [`mcp-grpc-transport`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport). What was missing was the adoption wedge: a thin adapter that makes _any_ MCP server look like the APIs people already know how to call — while advertising the gRPC path in every Swagger page.

That package is **`mcp-api-adapter`**.

---

## One process, five surfaces

```text
  Any MCP server
  ├─ stdio
  ├─ Streamable HTTP
  └─ gRPC
           │
           ▼
   mcp-api-adapter
           │
           ├── OpenAPI     POST /{toolName}  · /docs
           ├── GraphQL     POST /graphql     · /graphiql
           ├── MCP         Streamable HTTP   · /mcp
           ├── gRPC        CallTool (upstream or local scaffold)
           └── gen-cli     thin Node CLI over REST
```

You point the adapter at **one** upstream. It introspects `ListTools` and scaffolds the rest:

| Surface                 | What you get                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAPI / REST**      | `POST /{toolName}` — JSON body = tool arguments; Swagger at `/docs`                                                               |
| **GraphQL**             | Per-tool mutations + a generic `callTool` escape hatch; GraphiQL at `/graphiql`                                                   |
| **Streamable HTTP MCP** | Same catalog re-exported at `/mcp` for IDE / agent clients                                                                        |
| **gRPC**                | `model_context_protocol.Mcp/CallTool` via `mcp-grpc-transport` — reused if upstream is already gRPC, otherwise scaffolded locally |
| **gen-cli**             | A zero-dependency Node CLI that `POST`s to the REST surface (PrintingPress later for signed binaries)                             |

No ClawQL install required. It is a standalone npm package.

```bash
# Wrap a remote MCP server
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp

# Spawn a stdio package (exposes /mcp for IDEs)
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything

# On-ramp in front of an existing gRPC MCP server
npx mcp-api-adapter --grpc-address 127.0.0.1:50051

# Generate a thin CLI from the same catalog
npx mcp-api-adapter gen-cli --out ./my-cli --stdio -- \
  npx -y @modelcontextprotocol/server-everything
```

---

## How it works (without the poetry)

### Upstream → catalog

At startup the adapter connects over stdio, Streamable HTTP, or gRPC and calls `ListTools`. That catalog drives OpenAPI path generation, GraphQL schema fields, the `/mcp` tool list, and (when needed) the local gRPC bridge. Optional `--refresh-ms` re-polls when tools change.

### Call path

Every surface eventually becomes a `CallTool`:

1. **REST** — validate/route `POST /{name}` → call upstream → collapse the result to JSON (prefer `structuredContent`, else parse text as JSON, else return a content envelope).
2. **GraphQL** — same collapse behind per-tool mutations.
3. **`/mcp`** — MCP SDK Streamable HTTP server whose tools delegate into the same call function. When upstream is gRPC, protobuf content oneofs are normalized into MCP `{ type: "text", text }` blocks so SDK validation succeeds (fixed in `0.5.1`).
4. **gRPC** — if upstream is already gRPC, REST/GraphQL/`/mcp` dial that address. If upstream is stdio or HTTP, the adapter starts a local `mcp-grpc-transport` server that delegates into the same session.

### The funnel, not the destination

OpenAPI `info.x-clawql-grpc` documents the production path on every `/docs` visit: service name, `CallTool`, default port, reflection env, large-payload guidance. REST and GraphQL are **on-ramps**. gRPC is what you want in mesh, for large tool arguments, and for anything that should look like a normal cluster RPC.

---

## A five-minute demo narrative

1. **Swagger** — `POST /echo` with `{ "message": "hi" }`.
2. **GraphiQL** — `mutation { echo(message: "hi") }` — same tool, different dialect.
3. **`/mcp`** — point Cursor or an MCP SDK client at `http://127.0.0.1:8090/mcp`.
4. **OpenAPI extensions** — open `/openapi.json` and show `x-clawql-grpc`.
5. **gRPC** — same call via `grpcurl` / `callToolServerStreamingGrpc` on `:50051`. Optionally run the generated CLI against the REST base URL.

One catalog. Five ways to invoke it. One story for production.

---

## Not ClawQL Core (and not “the Agentic Gateway”)

Direction matters:

| Direction         | Product                     | Audience                                                                    |
| ----------------- | --------------------------- | --------------------------------------------------------------------------- |
| **OpenAPI → MCP** | ClawQL `search` / `execute` | Agents discovering _upstream_ REST/GraphQL/gRPC APIs as tools               |
| **MCP → APIs**    | `mcp-api-adapter`           | Workers, OpenWebUI, GraphQL clients, IDEs, mesh — wrapping _any_ MCP server |

ClawQL’s **Agentic Gateway** is a different product surface. `mcp-api-adapter` only adapts MCP tools onto call APIs (including re-exporting MCP itself when that is useful). In marketing we say **OpenAPI on-ramp**, **GraphQL on-ramp**, or **MCP tools as REST/GraphQL** — not bare “OpenAPI gateway,” which collides with Core’s inverse direction.

---

## Why re-export `/mcp`?

Because upstream shape rarely matches client shape.

- You have a **stdio-only** package and want Cursor to talk to it remotely → wrap with the adapter; give the IDE `https://…/mcp`.
- You have a **gRPC-only** production server and want an MCP SDK client in CI → same adapter; `/mcp` forwards into `CallTool`.
- You already expose Streamable HTTP and need Workers on REST plus mesh on gRPC → leave `/mcp` on, add the other surfaces, keep one process.

`--no-mcp` turns it off. `--mcp-path` renames it. Optional API key covers the HTTP edge; gRPC auth stays where it belongs (mTLS / mesh / interceptors).

---

## What ships today

| Version | What landed                                             |
| ------- | ------------------------------------------------------- |
| `0.3.x` | Any MCP upstream + OpenAPI + GraphQL + gRPC scaffold    |
| `0.4.0` | Rename to `mcp-api-adapter` (was `mcp-openapi-gateway`) |
| `0.5.0` | Streamable HTTP `/mcp` + `gen-cli`                      |
| `0.5.1` | gRPC → `/mcp` content normalization for SDK clients     |

In-repo now; independent npm publish follows the same cadence model as `mcp-grpc-transport`.

---

## Try it

```bash
npm install   # from the ClawQL repo, or npx the package once published
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything
# open http://127.0.0.1:8090/docs
# open http://127.0.0.1:8090/graphiql
# point an MCP client at http://127.0.0.1:8090/mcp
```

Further reading:

- User guide — [`docs/mcp/mcp-api-adapter.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-api-adapter.md)
- Design — [`docs/design/mcp-api-adapter.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-api-adapter.md)
- Package — [`packages/mcp-api-adapter`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-api-adapter)
- Example demos — [`examples/mcp-api-adapter`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/examples/mcp-api-adapter)
- Transport — [`mcp-grpc-transport`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport)

Call tools by name over HTTP. Prefer gRPC when it matters. The adapter exists so you do not have to choose one dialect for every consumer.

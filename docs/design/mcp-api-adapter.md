# MCP API Adapter — technical design

**Status:** ✅ Implemented (`mcp-api-adapter@0.5.1`) — any MCP upstream → OpenAPI + GraphQL + `/mcp` + gRPC (+ gen-cli); **npm registry publish still pending**  
**Date:** 2026-08-04  
**Package:** `mcp-api-adapter` (workspace `packages/mcp-api-adapter`; not yet on npmjs)  
**Depends on:** [`mcp-grpc-transport`](../../packages/mcp-grpc-transport/README.md) **1.0.0+**, `@modelcontextprotocol/sdk`  
**User guide:** [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md)  
**Example:** [`examples/mcp-api-adapter/`](../../examples/mcp-api-adapter/)  
**Related:** Vision & Roadmap · Managed Edge Gateway · Worker / OpenWebUI-style OpenAPI consumers · PrintingPress (planned CLI packaging)

---

## 1. Summary

Build a **thin TypeScript API adapter** that points at **any** MCP server and scaffolds **named REST (OpenAPI), GraphQL, and gRPC** from `ListTools` — so clients can call the same tools on all three APIs.

```text
Any MCP upstream
  stdio | Streamable HTTP | gRPC
        │
        ▼
  mcp-api-adapter
   GET  /openapi.json · /docs
   POST /{toolName}
   POST /graphql · GET /graphiql · GET /graphql/schema.graphql
   GET  /tools
   (+ scaffolded or upstream gRPC CallTool)
        │
        ▼
  Same tool registry (third-party or ClawQL)
```

When upstream is already gRPC, REST/GraphQL forward into **`mcp-grpc-transport` `CallTool`**. When upstream is stdio or Streamable HTTP, REST/GraphQL use the MCP SDK client, and the gateway **scaffolds a local gRPC MCP server** that delegates to that client — so consumers still get the triple surface without requiring the upstream to speak gRPC first.

This is **not** a clone of [mcpo](https://github.com/open-webui/mcpo) (Python, OpenAPI/REST-focused, strong Open WebUI mindshare). mcpo remains the right single-surface REST proxy for that community. This package is **transport-agnostic on the left** (stdio / Streamable HTTP / gRPC — **any language** upstream), **six surfaces on the right today** (OpenAPI + GraphQL + `/mcp` + gRPC + `/ws` + gen-cli) with **QR planned as seventh**, TypeScript-native as the _adapter process_, and positioned to drive traffic to **`mcp-grpc-transport`** for production/mesh. Essay draft: [`../gtm/pragmaticvectors/mcp-api-adapter.md`](../gtm/pragmaticvectors/mcp-api-adapter.md) → `https://pragmaticvectors.com/posts/mcp-api-adapter/`.

**Inverse of ClawQL Core:** `search` / `execute` is **OpenAPI → MCP** (upstream APIs behind tools). This package is **MCP tools → APIs** (tools as REST/GraphQL/gRPC/CLI for non-MCP clients). Combined claim: **[Protocol Fabric](../gtm/protocol-fabric.md)**. Keep the names and docs distinct.

---

## 2. Motivation

### 2.1 Product need

Consumers (Cloudflare Workers, OpenWebUI “OpenAPI tools”, custom gateways) want:

```http
POST /memory_recall
Content-Type: application/json

{ "query": "surveillance evidence", "limit": 8 }
```

not MCP JSON-RPC / Streamable HTTP session semantics.

### 2.2 Strategic differentiator

| Landscape fact                                                                                                               | Implication                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| MCP remote default is Streamable HTTP; local is stdio                                                                        | gRPC is the gap                                                                  |
| Google proposed gRPC as a first-class MCP transport (2026); community feedback Q1, implementation expected later if ratified | ClawQL already ships the TypeScript production transport                         |
| Community Go wrappers exist; **no** production-grade TypeScript peer                                                         | `mcp-grpc-transport` is the npm story                                            |
| mcpo covers MCP → OpenAPI in Python, stdio-centric                                                                           | Room for a **gRPC-first** TS package with an explicit migration path to raw gRPC |

### 2.3 Positioning (one line)

> Call MCP tools by name over HTTP. Production deployments use our gRPC transport — the only production TypeScript gRPC transport for MCP.

Every Swagger UI visitor should see the gRPC path (`x-clawql-grpc` extensions, docs links, large-payload guidance).

---

## 3. Non-goals

| Non-goal                                                                 | Why                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Full mcpo clone (Claude Desktop multi-server config matrix as a product) | We support stdio/HTTP/gRPC as _upstreams_, not a Desktop config UI    |
| Per-tool generated `.proto` RPCs                                         | Breaks when tools change at runtime; fights stable generic `CallTool` |
| Replacing Streamable HTTP for Cursor / Claude Desktop                    | IDEs stay on `/mcp`; we _wrap_ those servers                          |
| Product REST paths (`/payments/stripe/checkout`)                         | Tool-name REST only; domain gateways remain separate                  |
| Replacing ClawQL `search` / `execute`                                    | Opposite direction                                                    |

---

## 4. What already exists

| Capability                                                         | Location                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Generic `ListTools` / `CallTool` (name + `google.protobuf.Struct`) | `packages/mcp-grpc-transport/proto/model_context_protocol/mcp.proto` |
| Server start + health + reflection                                 | `maybeStartGrpcMcpServer`, `ENABLE_GRPC`, `ENABLE_GRPC_REFLECTION`   |
| Client helper for streaming CallTool                               | `callToolServerStreamingGrpc`, `mcpArgumentsToCallToolStructFields`  |
| ClawQL dual listen HTTP + gRPC                                     | `src/server-http.ts` when `ENABLE_GRPC=1`                            |
| Streamable HTTP MCP                                                | `POST /mcp` (not per-tool REST)                                      |

**Gap (closed in 0.3.0):** `POST /{toolName}`, OpenAPI + GraphQL from MCP `inputSchema`, and automatic gRPC scaffolding when upstream is stdio/HTTP.

---

## 5. Architecture

### 5.1 Package layout (proposed)

```text
packages/mcp-api-adapter/
  package.json                 # name: mcp-api-adapter
  README.md
  src/
    index.ts                   # public exports
    cli.ts                     # `mcp-api-adapter` / `npx` entry
    server.ts                  # Express (or Node http) app factory
    introspect.ts              # ListTools via gRPC → ToolCatalog
    openapi.ts                 # ToolCatalog → OpenAPI 3.1 document
    routes.ts                  # GET /tools, POST /:toolName, /openapi.json, /docs
    call.ts                    # REST body → CallTool (gRPC); optional HTTP fallback
    schema-convert.ts          # JSON Schema → OpenAPI request body schema
    grpc-extensions.ts         # x-clawql-grpc / info.description funnel copy
  test/
```

**Dependency rule:** depend on `mcp-grpc-transport` + `@modelcontextprotocol/sdk` types as needed. **Do not** depend on `clawql-mcp` / `clawql-api` so any MCP server behind gRPC can use the gateway.

### 5.2 Runtime modes

| Mode                        | Description                                                                                                         | v1                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **A. Sidecar / standalone** | Process points at `GRPC_HOST:GRPC_PORT` (e.g. ClawQL `:50051`), introspects, serves OpenAPI HTTP on its own port    | **Required**                   |
| **B. In-process mount**     | Optional Express router mounted beside ClawQL HTTP (`attachMcpApiAdapter(app, { … })`) when both run in one process | Nice-to-have                   |
| **C. HTTP MCP fallback**    | If gRPC unavailable, forward via Streamable HTTP `tools/call`                                                       | Optional; document as degraded |

**Default recommendation:** Mode A with ClawQL `ENABLE_GRPC=1`. REST is a **translator into gRPC**, not a peer protocol of equal rank.

### 5.3 Request path

```text
POST /memory_recall  { "query": "…", "limit": 8 }
  → validate body against cached inputSchema (optional AJV)
  → callToolServerStreamingGrpc({ name: "memory_recall", arguments })
  → collapse server-stream to unary HTTP response:
       - prefer structuredContent / first text JSON if present
       - else return MCP content[] envelope as JSON
  → map gRPC / MCP errors to HTTP 4xx/5xx
```

**Streaming / progress:** gRPC `CallTool` is server-streaming (`task_id`, progress, result). v1 **collapses to unary HTTP** (wait for final result; optional `CancelTask` on client disconnect). SSE progress is a later stretch goal.

### 5.4 Discovery refresh

- **Startup:** `ListTools` → build catalog + OpenAPI document.
- **Refresh:** env `MCP_API_ADAPTER_REFRESH_MS` (optional poll) and/or `POST /admin/refresh` (auth-gated) when tools change (`listChanged`).
- Path sanitization: tool names that are not valid single URL segments get a documented encoding (prefer reject / skip with warning over silent collision).

---

## 6. HTTP surface (v1 contract)

| Method | Path                      | Behavior                                                                     |
| ------ | ------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/healthz`                | Liveness; include upstream gRPC reachability when cheap                      |
| `GET`  | `/tools`                  | Raw tool list: `name`, `description`, `inputSchema`, optional `outputSchema` |
| `GET`  | `/openapi.json`           | OpenAPI **3.1** generated from catalog                                       |
| `GET`  | `/docs`                   | Swagger UI (or Scalar) pointed at `/openapi.json`                            |
| `POST` | `/{toolName}`             | JSON body = tool arguments; response = tool result JSON                      |
| `POST` | `/graphql`                | GraphQL endpoint (per-tool mutations + `callTool`)                           |
| `GET`  | `/graphiql`               | GraphiQL IDE                                                                 |
| `GET`  | `/graphql/schema.graphql` | Printed SDL                                                                  |

**Auth (v1):** optional shared API key (`Authorization: Bearer …` or `X-API-Key`), matching mcpo’s practical edge. Pass-through of upstream gRPC metadata (`Authorization`, `mcp-protocol-version`) must be configurable. Do **not** bypass ClawQL / Panguard policy: the facade must call the same tool surface the MCP client would (gRPC into the already-gated server).

**CORS:** opt-in env for browser OpenAPI explorers.

---

## 7. OpenAPI generation

### 7.1 Mapping rules

For each MCP tool `T` with JSON Schema `inputSchema`:

```yaml
paths:
  /{T.name}:
    post:
      operationId: mcp_tool__{sanitizedName}
      summary: { T.description }
      requestBody:
        required: true
        content:
          application/json:
            schema: { converted inputSchema }
      responses:
        "200":
          description: MCP tool result
          content:
            application/json:
              schema:
                # Prefer outputSchema when present; else generic content envelope
```

### 7.2 JSON Schema → OpenAPI (the hard slice)

MCP tools already advertise **JSON Schema** for inputs. Conversion edge cases to handle explicitly in tests:

| Case                        | Approach                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `$ref` / `$defs`            | Inline or preserve under `components.schemas` with unique prefixes per tool                                       |
| `anyOf` / `oneOf` / `allOf` | Pass through OpenAPI 3.1 combinators; document unsupported Draft features                                         |
| Recursive schemas           | Depth cap + `$ref` into components                                                                                |
| `additionalProperties`      | Preserve                                                                                                          |
| Non-object root schema      | Wrap as `{ "type": "object", "properties": { "value": … } }` **or** allow raw JSON body with documented exception |

Ship a small internal converter; evaluate existing libs only if they stay lightweight and license-clean (Apache-2.0 / MIT).

### 7.3 Funnel extensions (`x-clawql-grpc`)

Inject into OpenAPI `info` and/or each operation:

```json
{
  "info": {
    "title": "MCP tools (OpenAPI on-ramp)",
    "description": "REST facade over MCP tools. Prefer gRPC CallTool for production, mesh, and large payloads.",
    "x-clawql-grpc": {
      "service": "model_context_protocol.Mcp",
      "methods": ["ListTools", "CallTool"],
      "defaultPort": 50051,
      "protocolVersionMetadata": "mcp-protocol-version",
      "package": "mcp-grpc-transport",
      "docs": "https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport",
      "reflectionEnv": "ENABLE_GRPC_REFLECTION=1",
      "largePayloadNote": "Prefer gRPC CallTool over Streamable HTTP for large tool arguments (e.g. base64 documents)."
    }
  }
}
```

Swagger UI visitors see the migration path without leaving `/docs`.

---

## 8. CLI / config

```bash
# Point at ClawQL (or any) gRPC MCP endpoint
npx mcp-api-adapter \
  --grpc-host 127.0.0.1 \
  --grpc-port 50051 \
  --listen 0.0.0.0:8090 \
  --api-key "$GATEWAY_API_KEY"
```

| Env / flag                                  | Purpose                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `MCP_API_ADAPTER_GRPC_HOST` / `--grpc-host` | Upstream host                                                              |
| `MCP_API_ADAPTER_GRPC_PORT` / `--grpc-port` | Default `50051`                                                            |
| `MCP_API_ADAPTER_LISTEN` / `--listen`       | HTTP bind (default `0.0.0.0:8090`)                                         |
| `MCP_API_ADAPTER_API_KEY` / `--api-key`     | Optional edge auth                                                         |
| `MCP_PROTOCOL_VERSION`                      | Metadata for gRPC RPCs (default latest supported)                          |
| `MCP_API_ADAPTER_REFRESH_MS`                | Optional catalog poll                                                      |
| TLS client flags                            | Align with `mcp-grpc-transport` client TLS when upstream uses `GRPC_TLS_*` |

---

## 9. Security

1. **Edge auth** on the OpenAPI port (API key / later OIDC) — treat as a public-ish surface when exposed.
2. **Upstream trust:** prefer mTLS or private network to gRPC `:50051`.
3. **Policy:** never invent a second tool executor; always `CallTool` into the MCP server that already runs `beforeCallTool` / ATR / x402.
4. **Body limits:** document that large payloads should use **raw gRPC**, not this facade (same story as Streamable HTTP body limits).
5. **Admin refresh** must not be anonymous on exposed deployments.
6. **Tool name allow/deny lists** (optional) for reducing blast radius when wrapping broad servers like ClawQL `all-providers`.

---

## 10. Implementation plan

### Phase 0 — Design (this document)

- [x] Architecture, surface, non-goals, GTM funnel
- [ ] Tracking GitHub issue / Discussion RFC (human)

### Phase 1 — MVP package

1. [x] Workspace package + CLI
2. [x] gRPC `ListTools` introspection + in-memory catalog (`listToolsUnaryGrpc`)
3. [x] JSON Schema → OpenAPI path generation (happy path + fixture tests)
4. [x] `POST /{toolName}` → `CallTool` (unary collapse)
5. [x] `/openapi.json`, `/docs`, `/tools`, `/healthz`
6. [x] `x-clawql-grpc` extensions
7. [x] Example server + REST/gRPC demos (`examples/mcp-api-adapter/`)
8. [x] GraphQL on-ramp (`/graphql`, GraphiQL, per-tool mutations) + triple-surface demos
9. [x] Any-MCP upstreams (stdio / Streamable HTTP / gRPC) + local gRPC scaffold + user guide

### Phase 2 — Hardening

- Schema edge-case suite (`anyOf`, `$ref`, recursion)
- Catalog refresh + deny lists
- TLS client to upstream
- Helm example / Compose sidecar next to `clawql-mcp-http`
- Optional in-process mount on ClawQL HTTP

### Phase 3 — Ecosystem

- Publish npm independently (same cadence model as `mcp-grpc-transport`)
- Server card / well-known discovery mention (OpenAPI on-ramp URL)
- Blog / PV essay: “MCP tools as OpenAPI — gRPC underneath”
- Stretch: SSE progress mapping; HTTP MCP fallback mode

**Difficulty:** moderate. Transport RPC surface is done; the non-trivial slice is schema conversion + REST semantics + auth/policy parity.

---

## 11. Naming

| Option                            | Notes                                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| **`mcp-api-adapter`** (preferred) | Clear MCP → OpenAPI direction; mirrors ecosystem language             |
| `@clawql/mcp-gateway`             | Scoped; heavier ClawQL branding (still OK if published from monorepo) |
| `mcp-tools-openapi`               | Accurate but weaker “gateway” signal                                  |

Use **`mcp-api-adapter`** on npm unless packaging policy requires `@clawql/*`.

**Docs label:** “OpenAPI on-ramp” / “MCP tools as REST” — never “OpenAPI gateway” alone (ambiguous with ClawQL `execute` over OpenAPI providers).

---

## 12. GTM / docs funnel

| Surface                     | Action                                                       |
| --------------------------- | ------------------------------------------------------------ |
| This design                 | Canonical technical contract                                 |
| Vision & Roadmap            | Planned package row                                          |
| `mcp-grpc-transport` README | “OpenAPI on-ramp (planned)” → this doc                       |
| Docs index                  | Link under Architecture / MCP                                |
| Managed Edge Gateway        | Later: optional companion port or sidecar for Workers        |
| Announcements               | After MVP: “call tools by name over HTTP; production = gRPC” |

**Talk track:**

1. Demo Swagger: `POST /memory_recall`
2. Show `/openapi.json` `x-clawql-grpc`
3. Same call via `grpcurl` / `CallTool` on `:50051`
4. Note: Google’s transport proposal vs shipping TypeScript transport today

---

## 13. Success criteria

| Metric     | Signal                                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| Functional | Any tool registered on a gRPC MCP server appears as `POST /{name}` with valid OpenAPI |
| Funnel     | OpenAPI `info.x-clawql-grpc` present; README leads with gRPC                          |
| Generality | Works against a **non-ClawQL** `McpServer` + `maybeStartGrpcMcpServer` fixture        |
| Safety     | Facade cannot invoke tools without going through upstream MCP CallTool                |
| Adoption   | npm install + one Compose/Helm example; linked from vision roadmap                    |

---

## 14. Alternatives considered

| Alternative                          | Rejected because                                                         |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Recommend mcpo only                  | Python/stdio-centric; no gRPC funnel; external dependency for core story |
| REST → Streamable HTTP only          | Misses differentiator; large-payload and mesh story weaker               |
| Per-tool protobuf codegen            | Runtime tool churn; breaks generic proto stability                       |
| Fold into Managed Edge Gateway first | Couples on-ramp to ClawQL hosting; delays standalone npm story           |

---

## 15. References

- [`packages/mcp-grpc-transport/README.md`](../../packages/mcp-grpc-transport/README.md)
- [`proto/model_context_protocol/mcp.proto`](../../packages/mcp-grpc-transport/proto/model_context_protocol/mcp.proto)
- [`src/server-http.ts`](../../src/server-http.ts) — ClawQL HTTP + optional gRPC
- [open-webui/mcpo](https://github.com/open-webui/mcpo) — prior art (MCP → OpenAPI, different stack)
- Vision & Roadmap: [`docs/vision/clawql-vision-roadmap.md`](../vision/clawql-vision-roadmap.md)

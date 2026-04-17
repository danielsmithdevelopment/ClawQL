# mcp-grpc-transport

**Pluggable [gRPC](https://grpc.io/) transport for the [Model Context Protocol](https://modelcontextprotocol.io)** (MCP), built on [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

**First release on npm: [`0.1.0`](https://www.npmjs.com/package/mcp-grpc-transport).** This README describes the initial public API; there are no earlier npm releases ([`CHANGELOG.md`](CHANGELOG.md) is shipped in the package and says the same). For why the code exists (ClawQL, Python PoC), see [Background](#background-clawql-and-the-python-reference).

It exposes:

- **`grpc.health.v1.Health`** — standard [gRPC health checking](https://github.com/grpc/grpc/blob/master/doc/health-checking.md) (`Check` / `Watch`) for Kubernetes probes and meshes.
- **`model_context_protocol.Mcp`** — protobuf unary/streaming RPCs matching [GoogleCloudPlatform/mcp-python-sdk-grpc-poc](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc) (`ListTools`, `CallTool`, `ListResources`, `ReadResource`, `Complete`, …). Clients **must** send **`mcp-protocol-version`** metadata (same strings as the TypeScript SDK’s supported protocol versions). See [`proto/model_context_protocol/mcp.proto`](proto/model_context_protocol/mcp.proto).
- **`mcp.transport.v1.Mcp.Session`** — optional bidirectional stream of JSON-RPC messages (stdio-style NDJSON over [`JsonRpcLine`](proto/mcp/transport/v1/mcp.proto)), for clients that do not use the protobuf unary/stream surface.

Optional **`ENABLE_GRPC_REFLECTION=1`** enables [gRPC server reflection](https://github.com/grpc/grpc/blob/master/doc/server-reflection.md) for `grpcurl list` / `describe`.

**Status:** **0.1.0** — pre-1.0; wire format may evolve if the ecosystem standardizes a single canonical MCP `mcp.proto`; feedback welcome.

### Background (ClawQL and the Python reference)

This package was first built in the **[ClawQL](https://github.com/danielsmithdevelopment/ClawQL)** monorepo so **[ClawQL](https://github.com/danielsmithdevelopment/ClawQL)** (`clawql-mcp`) could offer **gRPC** alongside Streamable HTTP: at the time there was **no published TypeScript / npm** implementation of the MCP **protobuf** surface—only community references such as Google’s **[mcp-python-sdk-grpc-poc](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc)** (Python). Wire shape, required metadata (for example **`mcp-protocol-version`**), and parity goals follow that repo; this project bridges those RPCs to **[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)** on Node. ClawQL remains the **reference server** that exercises the package in production; the library itself is **generic** (see [Generality](#generality-what-any-mcp-server-means-here) below).

### Parity with the reference Python gRPC PoC (and beyond)

The [community MCP Python gRPC PoC](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc) documents transport gaps (e.g. prompts, completion, pagination, logging as “not supported” on its gRPC transport). **This package targets full protobuf RPC coverage plus spec-shaped `RequestFields` / `ResponseFields` behavior** on top of `@modelcontextprotocol/sdk`:

| Capability                 | Here (`mcp-grpc-transport`)                            | Notes                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protobuf MCP surface       | `model_context_protocol.Mcp`                           | All RPCs; **`CancelTask`** is implemented (abort + `common.task_id`); **`ListTools` / `ListResources` / `ListPrompts` / `ListResourceTemplates`** pass **`common.cursor`** and return **`common.next_cursor`** when the SDK paginates. |
| Logging                    | `notifications/message` → `ResponseFields.log_message` | Bridge captures server log lines during each unary/stream RPC (latest wins on the wire).                                                                                                                                               |
| Request `common.log_level` | `logging/setLevel`                                     | Applied before the handler runs (protobuf `LogLevel` enum).                                                                                                                                                                            |
| Routing hints              | Metadata                                               | `mcp-tool-name`, `mcp-resource-uri`, `mcp_prompt` optional checks (match `CallTool` / `ReadResource` / `GetPrompt`).                                                                                                                   |
| `CallTool` streaming       | Progress + `task_id`                                   | First stream message includes **`task_id`**; cancel via **`CancelTask`** with that id.                                                                                                                                                 |
| JSON-RPC session stream    | `mcp.transport.v1.Mcp`                                 | Alternative wire for TypeScript-centric clients.                                                                                                                                                                                       |
| `grpc.health.v1`           | `Check` / `Watch`                                      | Overall + scoped check for **`model_context_protocol.Mcp`** and **`mcp.transport.v1.Mcp`**.                                                                                                                                            |
| Server reflection          | Opt-in env                                             | `ENABLE_GRPC_REFLECTION=1`.                                                                                                                                                                                                            |
| TLS / mTLS                 | Env-driven server creds                                | `GRPC_TLS_*`; clients must use a **hostname** that matches the cert for SNI (e.g. `localhost`, not a bare `127.0.0.1` target, when the cert is issued for `localhost`).                                                                |
| Observability              | `grpcServerOptions` on `maybeStartGrpcMcpServer`       | Forwarded to `new grpc.Server(...)`: channel limits, **`interceptors`** (OpenTelemetry-style server interceptors in `@grpc/grpc-js`), etc.                                                                                             |

**`dependent_requests` / `dependent_responses` (protobuf unary):** The TypeScript **`@modelcontextprotocol/sdk`** completes server→client work in-process, so **`McpGrpc` servicers** (including ClawQL’s bridge) typically return **empty** `dependent_requests`, same as the [community Python gRPC PoC server](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc/blob/main/src/mcp/server/grpc.py). For **gRPC clients** that talk to a server which **does** populate `dependent_requests`, this package exports **`runUnaryWithDependents`** and **`fulfillDependentRequests`** (see [source on GitHub](https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/mcp-grpc-transport/src/mcp-protobuf-dependent.ts)) to implement the spec retry loop and map protobuf sampling / roots / elicitation to MCP-shaped handler results. For **full** MCP over one wire with the official JSON-RPC framing, use **`mcp.transport.v1.Mcp.Session`** (same process as Streamable HTTP) or **`StreamableHTTPClientTransport`** over HTTP.

### Streamable HTTP (“RESTful” MCP) vs gRPC (this package)

| Topic                 | Streamable HTTP (`StreamableHTTPClientTransport`)                            | gRPC (`model_context_protocol.Mcp` + this package)                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framing               | HTTP POST + **SSE** (GET) for server→client events                           | **HTTP/2**, protobuf unary + **`CallTool`** server-stream                                                                                                                                                                                                                                                                                                                                                                                    |
| Session               | **`Mcp-Session-Id`**, optional **`terminateSession()`**                      | **Per bidi stream**; copy session id in gRPC metadata **`mcp-session-id`** (same name as HTTP, lowercased by gRPC). **`GrpcMcpSessionTransport`** fills **`TransportSendOptions`** on **`send()`** (`related_request_id`, `resumption_token`, `onresumptiontoken`) into optional **`JsonRpcLine`** fields and passes **`MessageExtraInfo`** on **`onmessage`** (gRPC metadata + **`x-grpc-*`** + optional **`Authorization` → `authInfo`**). |
| Resilience            | **Resumption tokens**, **`resumeStream(lastEventId)`**, reconnection backoff | **gRPC retries** / **deadlines** (client-side); **`CancelTask`** + `task_id` for tools                                                                                                                                                                                                                                                                                                                                                       |
| Auth                  | **OAuth** via `OAuthClientProvider`, `finishAuth`                            | **TLS** / **mTLS** (`GRPC_TLS_*`); **interceptors** on `grpcServerOptions`                                                                                                                                                                                                                                                                                                                                                                   |
| Dependent server work | Handled inside MCP **JSON-RPC** on the same transport                        | Same **in-process** story for **SDK servers**; **pure gRPC** clients use **`runUnaryWithDependents`** when the server fills `dependent_requests`                                                                                                                                                                                                                                                                                             |

The SDK’s **Streamable HTTP** tests live under **`node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/`** (e.g. `simpleStreamableHttp`); they exercise **OAuth**, **SSE**, and **session** semantics that **do not** map 1:1 to gRPC—use **HTTP** when you need those; use **gRPC** when you want **multiplexing**, **binary protobuf**, or **mesh-native** health ( **`grpc.health.v1`** ).

### Generality (what “any MCP server” means here)

- **Runtime:** Works with **any** [`McpServer`](https://github.com/modelcontextprotocol/typescript-sdk) you construct — pass your own `createMcpServer` (register tools, resources, prompts as usual). There is **no** dependency on ClawQL or OpenAPI.
- **Wire:** Clients use **`mcp.transport.v1.Mcp` / `Session`**; the payload is standard **JSON-RPC over MCP**.
- **Tests:** Cover **`grpc.health.v1.Health/Check`** (including scoped / unknown service), **`Health/Watch`**, **TLS** `Session` + **initialize**, reflection, **`grpcServerOptions`**, and a short **`initialize` → `notifications/initialized` → `ping`** flow.

## Reference server

**[ClawQL](https://github.com/danielsmithdevelopment/ClawQL)** (`clawql-mcp`) is the original integrator: it uses this package for optional **`ENABLE_GRPC`** alongside Streamable HTTP — token-efficient **`search` / `execute`** over OpenAPI/Discovery, plus optional vault and sandbox tools. See **[Background](#background-clawql-and-the-python-reference)** for why the package exists and how it relates to the **[Python gRPC PoC](https://github.com/GoogleCloudPlatform/mcp-python-sdk-grpc-poc)**.

## Install

```bash
npm install mcp-grpc-transport @modelcontextprotocol/sdk
```

## Usage

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./your-tools.js"; // your app
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "my-server", version: "1.0.0" });
  registerTools(server);
  return server;
}

process.env.ENABLE_GRPC = "1";
const grpc = await maybeStartGrpcMcpServer({ createMcpServer: createMcpServer });
if (grpc) {
  console.error(`gRPC MCP listening on ${grpc.address} (mcp-grpc-transport ${grpc.version})`);
}
```

Optional second argument-style options:

```typescript
await maybeStartGrpcMcpServer({
  createMcpServer,
  grpcServerOptions: {
    "grpc.max_receive_message_length": 8 * 1024 * 1024,
    // interceptors: [ ... ] // @grpc/grpc-js ServerInterceptor[]
  },
});
```

### Exports (public API)

The npm package’s public surface is exactly what [`src/index.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/mcp-grpc-transport/src/index.ts) re-exports.

**Server / JSON-RPC session**

| Export                              | Notes                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maybeStartGrpcMcpServer`           | Starts the gRPC server when `ENABLE_GRPC` is set; wires **`grpc.health.v1`**, **`model_context_protocol.Mcp`**, and **`mcp.transport.v1.Mcp.Session`**. |
| `GrpcMcpSessionTransport`           | In-process **`Transport`** implementation for the **`Session`** bidi stream (JSON-RPC over **`JsonRpcLine`**).                                          |
| `PROTOBUF_MCP_SERVICE_FQN`          | Full name of **`model_context_protocol.Mcp`** for **`grpc.health.v1.Health/Check`** `service` and docs.                                                 |
| `MCP_TRANSPORT_SESSION_SERVICE_FQN` | Full name of **`mcp.transport.v1.Mcp`** for scoped health checks.                                                                                       |

**Types:** `GrpcMcpServerOptions`, `StartedGrpcServer`.

**Protobuf `dependent_requests` helpers** (for gRPC clients when the server fills `dependent_requests`)

| Export                                 | Notes                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `runUnaryWithDependents`               | Runs a unary RPC and loops on **`dependent_requests`** / **`dependent_responses`** until complete. |
| `fulfillDependentRequests`             | Maps protobuf sampling / roots / elicitation to MCP-shaped handlers you supply.                    |
| `parseResumeData` / `encodeResumeData` | Resume payload helpers for **`resume_data`**.                                                      |
| `protoSamplingMessageToMcp`            | Converts protobuf sampling messages to MCP types.                                                  |

**Types:** `DependentHandlers`, `UnaryWithCommon`.

### Environment

| Variable                                                                                         | Purpose                    |
| ------------------------------------------------------------------------------------------------ | -------------------------- |
| `ENABLE_GRPC`                                                                                    | `1` or `true` to listen    |
| `GRPC_PORT`                                                                                      | Default `50051`            |
| `GRPC_BIND`                                                                                      | Default `0.0.0.0`          |
| `ENABLE_GRPC_REFLECTION`                                                                         | `1` to register reflection |
| `GRPC_TLS_CERT_PATH` / `GRPC_TLS_KEY_PATH` / `GRPC_TLS_CA_PATH` / `GRPC_TLS_REQUIRE_CLIENT_CERT` | TLS / mTLS                 |

### Health

- Overall: `grpc.health.v1.Health/Check` with `service: ""`.
- Protobuf MCP: `service: "model_context_protocol.Mcp"` (export **`PROTOBUF_MCP_SERVICE_FQN`**).
- JSON-RPC session service: `service: "mcp.transport.v1.Mcp"` (export **`MCP_TRANSPORT_SESSION_SERVICE_FQN`**).

### Kubernetes

Use native [`grpc` probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/#grpc-probes) on port **50051** when gRPC is enabled. Example overlay: [ClawQL `docker/kustomize/overlays/grpc-enabled`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/docker/kustomize/overlays/grpc-enabled).

## Publishing (maintainers)

From the ClawQL monorepo root, publish **`mcp-grpc-transport`** before **`clawql-mcp`** so `workspace:*` resolves on npm:

```bash
npm publish -w mcp-grpc-transport --access public
npm publish -w clawql-mcp
```

## License

Apache-2.0 (same as ClawQL).

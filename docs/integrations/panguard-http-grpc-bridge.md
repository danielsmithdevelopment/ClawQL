# Building your own HTTP/gRPC bridge to stock Panguard (stdio)

You **do not** need Panguard to ship a gateway image if you add a **thin transport layer** that speaks **Streamable HTTP** and/or **gRPC** on the outside and **stdio MCP** on the inside—where **`@panguard-ai/panguard-mcp-proxy`** already runs.

This doc explains **why a naive sidecar usually fails** and the **patterns that work**.

## Why “sidecar next to Panguard” is awkward

Stock **`panguard-mcp-proxy`** is wired as:

```text
Agent (MCP client) ←stdio→ Panguard (MCP server) ←stdio→ Upstream MCP server (subprocess)
```

Kubernetes gives each container **its own PID namespace and stdin/stdout**. There is **no** supported way for **container A** to attach to **container B**’s subprocess stdio the way the MCP SDK expects. **`shareProcessNamespace: true`** still does not merge separate containers’ stdio streams into one MCP pipe.

So **two containers** (bridge | Panguard) **cannot** share one stdio MCP session **without** you inventing a custom IPC layer (Unix socket, TCP loopback, named pipe in `emptyDir`, etc.) **and** changing how one side connects—not something the npm proxy does out of the box.

**Practical recommendation:** implement the bridge as **one container** (single PID namespace) that either:

1. **Spawns** the full `panguard-mcp-proxy -- …` chain as a **child** and uses **`StdioClientTransport`** from **`@modelcontextprotocol/sdk`** to talk to it from your HTTP/gRPC listener, or
2. Runs **one Node process** that starts Express **`StreamableHTTPServerTransport`** (same ideas as [`src/server-http.ts`](../../src/server-http.ts)) and embeds the spawn + stdio client internally.

## Pattern A — Remote ClawQL over HTTP (recommended mental model)

Keep **`clawql-mcp-http`** as today (specs, vault, GraphQL). Your gateway pod does **not** need a second full ClawQL if you insert a **stdio MCP “shim”** process that Panguard already knows how to spawn:

```text
Istio / clients  ─HTTP/gRPC─►  Your gateway  ─stdio MCP client─►  panguard-mcp-proxy  ─stdio MCP server─►  shim  ─HTTP MCP client─►  svc/clawql-mcp-http:8080/mcp
```

1. **`shim`** (small Node program): MCP **server** on **stdio** (what Panguard’s upstream client expects). On each tool call, forward using **`StreamableHTTPClientTransport`** (see [`src/server-http.test.ts`](../../src/server-http.test.ts) imports from `@modelcontextprotocol/sdk/client/streamableHttp.js`) to **`http://clawql-mcp-http.<ns>.svc.cluster.local:8080/mcp`** (plus session handling consistent with ClawQL).

2. **Panguard:**  
   `panguard-mcp-proxy -- node /app/shim/dist/index.js`  
   (or wrap in `npx` / pinned paths).

3. **Your gateway:** Express app + **`StreamableHTTPServerTransport`** like ClawQL, but **`createRegisteredMcpServer()`** is **not** used—instead each MCP server handler **delegates** to an MCP **client** connected via **`StdioClientTransport`** to:

   `npx -y @panguard-ai/panguard-mcp-proxy -- node /app/shim.js`

   You must align **session vs single stdio pipe** with how many concurrent HTTP sessions you allow (often **one child per HTTP session** or a documented limitation).

## Pattern B — Colocated ClawQL stdio (heavy but simple)

Run **`panguard-mcp-proxy -- npx clawql-mcp`** **inside the same container** as your HTTP listener, with **`StdioClientTransport`** from the gateway to that child. You **duplicate** ClawQL config/memory in the proxy pod—acceptable for labs, painful for prod.

## gRPC

ClawQL’s gRPC MCP implementation is **`mcp-grpc-transport`** (see [`src/server-http.ts`](../../src/server-http.ts) **`maybeStartGrpcMcpServer`**).

The repo **`clawql-panguard-mcp-bridge`** image (**[`packages/panguard-mcp-bridge`](../../packages/panguard-mcp-bridge)**) starts the same listener when **`ENABLE_GRPC=1`**: each **`mcp.transport.v1.Mcp` Session** stream **async-spawns** the Panguard stdio chain (same as HTTP **initialize**), then **`wireDelegationHandlers`** on the session **`McpServer`**. Unary protobuf **`model_context_protocol.Mcp`** RPCs share a **minimal empty** in-process server — use **Session** or **HTTP** for delegated tools.

Helm: **`charts/clawql-mcp/values-mcp-proxy-panguard-bridge.example.yaml`** sets **`ENABLE_GRPC`** and **`GRPC_PORT`** alongside **`CLAWQL_BRIDGE_*`**.

## Helm

Use **`mcpProxy.mode: custom`** with **`ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge`** (see **[`panguard-kubernetes.md`](panguard-kubernetes.md)** and the example values file).

## Pitfalls

- **Session headers:** ClawQL Streamable HTTP uses **`mcp-session-id`**; your shim’s HTTP client must preserve semantics ClawQL expects.
- **Latency:** two hops + ATR—matches the “compound latency” warning in the **[comprehensive guide §5](../security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md)**.
- **Health:** expose **`/healthz`** on **8080** for probes (Kyverno/signing unchanged for third-party images).

## If you still want two containers

Possible but **you** own the contract: e.g. **bridge** listens on **`127.0.0.1` in the pod network namespace**—actually separate containers don’t share loopback. You’d use **`127.0.0.1` on shared network namespace** — still separate. So use **Service `ClusterIP` targeting bridge only** and **no** separate Panguard container, **or** Unix socket on **`emptyDir`** volume mounted in **both** containers with a **custom** Panguard fork—out of scope for stock npm.

**Summary:** build a **bridge container**, not a **Panguard sidecar**, unless you add explicit IPC.

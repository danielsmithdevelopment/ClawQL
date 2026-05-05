# Panguard + ClawQL on Kubernetes (Helm path)

**Goal:** Run **Panguard** as the MCP chokepoint **inside the cluster**, in front of **`clawql-mcp-http`**, with **Streamable HTTP** on **`/mcp`** and eventually **native MCP gRPC** on **50051** — all **wired through Helm** (`charts/clawql-mcp` **`mcpProxy`**).

## What exists upstream today

The published npm package **[`@panguard-ai/panguard-mcp-proxy`](https://www.npmjs.com/package/@panguard-ai/panguard-mcp-proxy)** is **stdio ↔ stdio**: it spawns the upstream MCP server as a **subprocess** and speaks MCP over **stdio** to the agent. That matches **local** clients (e.g. Cursor config wrapping `npx clawql-mcp`).

It does **not**, by itself, terminate **HTTP** or **gRPC** MCP the way **`clawql-mcp-http`** exposes **`POST /mcp`** and **`ENABLE_GRPC=1`** on **50051**. So there is **no drop-in container** yet that you can point Istio at while keeping full ATR semantics on every tool call over those transports.

**Roll your own:** you can build a **gateway container** (stdio MCP ↔ HTTP/gRPC) around stock npm Panguard—see **[`panguard-http-grpc-bridge.md`](panguard-http-grpc-bridge.md)** (why a plain sidecar usually fails, and workable topologies).

## What ClawQL Helm bundles today

| `mcpProxy.mode`       | Purpose                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`nginx`** (default) | **Gateway → proxy → ClawQL** ordering with **HTTP reverse proxy** + **TCP stream** for **50051** (gRPC passthrough). Validates **mesh topology**, **HA**, and **latency SLO** hooks — **not** ATR/JWT enforcement on payloads.                                                                                                            |
| **`custom`**          | Run **your** gateway image — reference **`ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge`** (repo-built bridge) or an internal fork. Set **`mcpProxy.custom.image`**, optional **`command`** / **`args`**, **`extraEnv`**. Same **`Service`** ports (**8080** / **50051**) so Istio **`VirtualService`** backends stay stable. |

**Production-shaped example:** pin **`ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge`** (built from **`docker/panguard-mcp-bridge/Dockerfile`**, signed in **[`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml)**). The chart ships a ready-made overlay:

**[`charts/clawql-mcp/values-mcp-proxy-panguard-bridge.example.yaml`](../../charts/clawql-mcp/values-mcp-proxy-panguard-bridge.example.yaml)** — copy or **`helm upgrade -f`** it; tune **`CLAWQL_BRIDGE_UPSTREAM_URL`**, **`ENABLE_GRPC`**, and tags **`sha-*`** / **`nightly`** per **[`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)**.

Minimal inline snippet (same semantics):

```yaml
mcpProxy:
  enabled: true
  mode: custom
  replicaCount: 2
  custom:
    image:
      repository: ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge
      tag: nightly
    extraEnv:
      - name: CLAWQL_BRIDGE_UPSTREAM_URL
        value: "http://clawql-mcp-http.clawql.svc.cluster.local:8080/mcp"
      - name: ENABLE_GRPC
        value: "1"
```

Use your release namespace instead of **`clawql`** if different. **`fullnameOverride: clawql-mcp-http`** keeps the backend Service name **`clawql-mcp-http`**.

Point Istio at the proxy Service (same as nginx mode): **`CLAWQL_ISTIO_MCP_HTTP_BACKEND_HOST=clawql-mcp-http-proxy`** when applying [`docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml`](../../docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml) via [`scripts/kubernetes/install-istio-docker-desktop.sh`](../../scripts/kubernetes/install-istio-docker-desktop.sh). See **[`docs/security/mcp-proxy-jwt-atr.md`](../security/mcp-proxy-jwt-atr.md)**.

## Local stdio integration (works today)

For **stdio** MCP (no K8s HTTP hop), wrap ClawQL with Panguard’s CLI pattern from their README:

`panguard-mcp-proxy -- npx clawql-mcp …`

That **does** enforce ATR on tool calls on the stdio path.

## Roadmap / remaining hardening

1. **HTTP + gRPC Session:** the **`clawql-panguard-mcp-bridge`** image terminates **Streamable HTTP** and (when **`ENABLE_GRPC=1`**) **`mcp.transport.v1.Mcp` Session** JSON-RPC streams via **`mcp-grpc-transport`**, each session spawning **`panguard-mcp-proxy`** → shim → **`clawql-mcp-http`**. Unary protobuf **`model_context_protocol.Mcp`** on the same gRPC port uses an **empty shared** server today — clients should use **Session** or **HTTP** for full tool parity.
2. **JWT ATR:** mesh / IdP JWT validation at the chokepoint per **[comprehensive guide §3](../security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md)** — wire env when your IdP is fixed; **`mcpProxy.custom.extraEnv`** remains the integration surface.
3. **Upstream Panguard:** optional velocity if **`@panguard-ai`** publishes a maintained gateway image; until then the ClawQL-built bridge is the reference path.

**Tracking:** [#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272).

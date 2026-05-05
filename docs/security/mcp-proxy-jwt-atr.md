# MCP chokepoint: JWT ATR binding

**Issue:** [#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)  
**Narrative:** [`clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`](clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md) **§3** (JWT ATR session tokens) and **§5** (MCP runtime protection).

## Goal

Every MCP tool request must pass through a **single chokepoint** that validates **cryptographically bound scope** (JWT carrying **ATR** — Access-Task-Resource claims). The agent **cannot** widen its own claims; only the identity gateway / IdP path can issue or refresh tokens.

ClawQL **`clawql-mcp-http`** remains the MCP workload; the proxy sits **in front** of it on the data path.

## Target traffic shape

North–south order (conceptual):

1. **Ingress / Istio `Gateway`** — TLS termination, optional JWT issuance or forwarding per your IdP integration.
2. **MCP policy proxy** (e.g. **Panguard** or equivalent) — validates JWT signature + ATR claims **per request**, enforces tool allowlists / OWASP Agentic patterns, synchronous allow/deny.
3. **`Service/clawql-mcp-http`** — Streamable HTTP MCP on **`/mcp`** (and optional gRPC on **50051**).

## Helm (`charts/clawql-mcp`)

Enable **`mcpProxy.enabled`** to deploy **`Deployment`/`Service` `…-proxy`** (default **`replicaCount: 2`**) in the release namespace.

- **`mcpProxy.mode: nginx`** (default): **HTTP** reverse proxy + **TCP stream** on **50051** (gRPC passthrough) to **`clawql-mcp-http`** — proves **Gateway → proxy → ClawQL** ordering, HA, and SLO hooks; **no** ATR on payloads.
- **`mcpProxy.mode: custom`**: run **your** gateway image (**target:** Panguard HTTP+gRPC MCP proxy when available). Set **`mcpProxy.custom.image`**, **`command`**, **`args`**, **`extraEnv`**. Same Service ports **8080** / **50051** so Istio backends stay unchanged.

Panguard + K8s roadmap and example **`extraEnv`**: **[`docs/integrations/panguard-kubernetes.md`](../integrations/panguard-kubernetes.md)**.

Values reference: [`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml) (`mcpProxy`).

Optional **`mcpProxy.slo.prometheusRule.enabled`** renders a **`PrometheusRule`** (`monitoring.coreos.com/v1`) that alerts when Istio **HTTP** p99 latency to the proxy Service exceeds **`httpP99LatencyThresholdMs`** (default **50**) for **`forDuration`** (default **15m**). Tune the **`destination_service_name`** regex if your mesh labels differ.

**Kyverno:** the default **`verifyImages`** policy lists **`ghcr.io/.../clawql-mcp*`**, **`clawql-panguard-mcp-bridge*`**, and **`clawql-website*`**. Third-party images (**Docker Hub `nginx`** in **`mcpProxy.mode: nginx`**, or **unsigned** custom gateways) are **not** matched unless you extend **`kyverno.imageSignaturePolicy.imageReferences`** or disable verification for those workloads.

## Istio Docker Desktop helper

[`docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml`](../../docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml) uses placeholders expanded by [`scripts/kubernetes/install-istio-docker-desktop.sh`](../../scripts/kubernetes/install-istio-docker-desktop.sh):

| Env                                      | Default           | Purpose                                        |
| ---------------------------------------- | ----------------- | ---------------------------------------------- |
| **`CLAWQL_ISTIO_MCP_HTTP_BACKEND_HOST`** | `clawql-mcp-http` | `VirtualService` HTTP route `destination.host` |
| **`CLAWQL_ISTIO_MCP_HTTP_BACKEND_PORT`** | `8080`            | HTTP `destination.port`                        |
| **`CLAWQL_ISTIO_MCP_GRPC_BACKEND_HOST`** | same as HTTP      | TCP **50051** route host                       |
| **`CLAWQL_ISTIO_MCP_GRPC_BACKEND_PORT`** | `50051`           | TCP destination port                           |

With Helm **`mcpProxy.enabled`** and default **`fullnameOverride`**, set **`CLAWQL_ISTIO_MCP_HTTP_BACKEND_HOST=clawql-mcp-http-proxy`** (and matching gRPC host unless you split paths) **before** running the Istio install script so north–south MCP hits the proxy first.

## Operations

- **HA:** losing all proxy replicas denies MCP — scale **`mcpProxy.replicaCount`** like any ingress tier.
- **Latency:** the comprehensive guide cites **&lt;50ms** per intercept layer; stacked proxies **compound** — load-test before raising agent concurrency ([**§5**](clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md)).
- **Blocked requests:** agents must surface errors — **[`AGENTS.md`](../../AGENTS.md)**.

## Agent tooling note

The MCP **`cache`** tool is **in-process scratch state**, not a substitute for JWT ATR enforcement ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)).

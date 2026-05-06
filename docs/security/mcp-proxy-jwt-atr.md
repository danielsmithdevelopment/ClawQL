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

## `clawql-panguard-mcp-bridge` optional JWT gate

The bridge image can enforce a **second line** of JWT verification **at the gateway** (HTTP `Authorization: Bearer …` and gRPC `authorization` metadata). This is **off by default** and is **not** a substitute for Istio / IdP / Panguard when those already validate every request; enable it when you need an explicit chokepoint on the gateway process.

| Variable                                 | Meaning                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`CLAWQL_MCP_JWT_ENABLED`**             | Set **`1`** / **`true`** to enable verification on MCP HTTP routes and gRPC MCP RPCs (**not** **`/healthz`**; **`grpc.health.v1.Health`** is exempt).              |
| **`CLAWQL_MCP_JWT_JWKS_URL`**            | HTTPS URL for OIDC JWKS (RS256 tokens). Mutually exclusive with PEM / HS256 below (pick one mechanism).                                                            |
| **`CLAWQL_MCP_JWT_PUBLIC_KEY_PEM_PATH`** | Filesystem path to an SPKI / PEM **public** key used to verify RS256 JWTs.                                                                                         |
| **`CLAWQL_MCP_JWT_HS256_SECRET`**        | **Tests / development only.** Shared secret for HS256 verification; avoid in production.                                                                           |
| **`CLAWQL_MCP_JWT_ISSUER`**              | Optional JWT `iss` check.                                                                                                                                          |
| **`CLAWQL_MCP_JWT_AUDIENCE`**            | Optional `aud` check (comma-separated list).                                                                                                                       |
| **`CLAWQL_MCP_JWT_ATR_CLAIM`**           | Claim name that must be present and be a JSON **object or array** (default **`atr`**). Used as a minimal ATR-shaped binding signal; adjust to your IdP claim path. |

**HTTP failure:** **`401`** with JSON-RPC body `error.code` **`-32001`** and a message prefix **`Unauthorized:`**. **gRPC failure:** status **`UNAUTHENTICATED`** with details from verification.

Details and env tables: [`packages/panguard-mcp-bridge/README.md`](../../packages/panguard-mcp-bridge/README.md).

## Operations

- **HA:** losing all proxy replicas denies MCP — scale **`mcpProxy.replicaCount`** like any ingress tier.
- **Latency:** the comprehensive guide cites **&lt;50ms** per intercept layer; stacked proxies **compound** — load-test before raising agent concurrency ([**§5**](clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md)).
- **Blocked requests:** agents must surface errors — **[`AGENTS.md`](../../AGENTS.md)**.

## Agent tooling note

The MCP **`cache`** tool is **in-process scratch state**, not a substitute for JWT ATR enforcement ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)).

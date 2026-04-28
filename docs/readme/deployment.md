# ClawQL Deployment and Client Configuration

This guide links the common ways to run ClawQL and connect MCP clients.

## Local Stdio (Most Common)

Use `npx`:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

Configure Cursor/Claude to run `clawql-mcp` over stdio.

## Local/Remote HTTP MCP

Run:

```bash
PORT=8080 npm run start:http
```

Endpoints:

- MCP: `http://localhost:8080/mcp`
- Health: `http://localhost:8080/healthz` — set **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`** to include **`nativeProtocolMetrics`** in the JSON body: aggregate merge counts and execute ok/err totals for native HTTP GraphQL and gRPC unary, plus **`graphqlBySource`** and **`grpcBySource`** objects keyed by each native **`sourceLabel`** (merge counts refreshed at spec load; execute counters cumulative per label). ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191))
- **Prometheus:** `http://localhost:8080/metrics` — OpenMetrics text for native-protocol gauges/counters (**`prom-client`**); scrape this target from Prometheus rather than parsing **`/healthz`**. Set **`CLAWQL_DISABLE_HTTP_METRICS=1`** only if the route must be omitted (rare).
- GraphQL debug endpoint: `http://localhost:8080/graphql`

In **regulated** environments (HIPAA / SOC 2–style controls), treat **`/healthz`** and **`/metrics`** as **internal-only**: restrict routes with network policy, TLS, and mesh placement; never put identifiable patient data in **`sourceLabel`** or metric dimensions. See **[`docs/enterprise-mcp-tools.md` § Regulated deployments](../enterprise-mcp-tools.md#regulated-deployments)** ([#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133)).

## Cursor / Claude Configuration

Use:

- `.cursor/mcp.json.example` as the starting template for Cursor
- MCP docs from Cursor for `${env:...}` interpolation

For HTTP mode, configure a server with `url` ending in `/mcp`.
For stdio mode, configure `command` + `args`.

### Private tailnet (Tailscale MagicDNS)

When the MCP HTTP server runs on your **tailnet**, point Cursor (or another client) at the machine’s **MagicDNS** name — for example **`https://<machine>.<tailnet>.ts.net/mcp`** — or the HTTPS URL **Tailscale Serve** exposes. Use **`${env:CLAWQL_MCP_URL}`** in **`mcp.json`** so the URL stays out of git; define **`CLAWQL_MCP_URL`** in your shell profile or an env file your editor loads.

**Self-hosted Headscale** with **`*.clawql.local`** MagicDNS, firewall notes, validation checklist, and **public MCP URL deprecation** after cutover: **[`docs/deployment/headscale-tailnet.md`](../deployment/headscale-tailnet.md)** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)).

**`CLAWQL_MCP_URL`** is **not** read by **`clawql-mcp`** itself. It is used by **`scripts/workflows/mcp-workflow-complex-release-stack.mjs`** (**`npm run workflow:complex-release-stack:mcp`**) to attach to an already-running Streamable HTTP server (that script polls **`/healthz`** when this variable is set).

Align **provider base URLs** with the same private network: self-hosted **`PAPERLESS_BASE_URL`**, **`ONYX_BASE_URL`**, **`TIKA_BASE_URL`**, **`CLAWQL_SANDBOX_BRIDGE_URL`**, and **`CLAWQL_API_BASE_URL`** / **`CLAWQL_GRAPHQL_*`** should use tailnet hostnames (and HTTPS where Serve terminates TLS) so **`execute`** traffic stays off the public internet. Production hostname cutovers can be staged alongside infra changes ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)); docs and examples here use placeholders until URLs are final.

## Docker

See:

- `docker/README.md`

The image supports mounting a vault at `/vault` and running `clawql-mcp-http` or stdio mode.

## Cloud Run

Quick deploy:

```bash
PROJECT_ID="your-project-id" REGION="us-central1" bash scripts/deploy/deploy-cloud-run.sh
```

Or:

```bash
PROJECT_ID="your-project-id" REGION="us-central1" make deploy-cloud-run
```

Full guide: `docs/deployment/deploy-cloud-run.md`

## Kubernetes

Local Docker Desktop:

```bash
make local-k8s-up
```

This path installs **Kyverno**, uses **signed GHCR** images for ClawQL MCP/UI, and applies the chart’s **`verifyImages`** policy in the **`clawql`** namespace. Unsigned local image overrides are not supported. **End-to-end** supply chain and admission narrative: **`docs/security/golden-image-pipeline.md`**.

Remote clusters:

```bash
ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> make deploy-k8s
```

References:

- `docs/deployment/deploy-k8s.md`
- `docs/deployment/helm.md`
- `docs/deployment/headscale-tailnet.md`
- `docs/security/golden-image-pipeline.md`
- `docker/README.md`

## Optional gRPC Transport

Set:

```bash
ENABLE_GRPC=1
```

Optional reflection:

```bash
ENABLE_GRPC_REFLECTION=1
```

Package docs and invocation details:

- `packages/mcp-grpc-transport/README.md`

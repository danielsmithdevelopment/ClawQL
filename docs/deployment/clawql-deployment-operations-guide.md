# ClawQL — Deployment & Operations Guide

**For platform engineers and operators · June 2026**  
Apache 2.0 / MIT · [github.com/danielsmithdevelopment/ClawQL](https://github.com/danielsmithdevelopment/ClawQL)

Operator-focused tier docs, **`ClawQLInstance` CRD** reference, and natural-language ops tables moved to **[Operator target architecture (design)](../design/operator-target-architecture.md)** — not shipped ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)).

---

## Before you start

### What you can deploy today

| Component                                                    | Status     | Canonical doc                                                                                                                                                             |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Helm chart `clawql-mcp`**                                  | ✅ Shipped | [helm.md](helm.md)                                                                                                                                                        |
| **Document pipeline** (Tika, Gotenberg, Stirling, Paperless) | ✅ Shipped | [idp-pipeline.md](../providers/idp-pipeline.md), `documentPipeline.enabled`                                                                                               |
| **Onyx** (optional + `knowledge_search_onyx`)                | ✅ Shipped | [onyx-knowledge-tool.md](../mcp/onyx-knowledge-tool.md)                                                                                                                   |
| **Nextcloud + Coneshare** (`idpCollaboration`)               | ✅ Shipped | [nextcloud-onboarding.md](../providers/nextcloud-onboarding.md), [coneshare-onboarding.md](../providers/coneshare-onboarding.md)                                          |
| **Dashboard + docs UI**                                      | ✅ Shipped | [agent-chat.md](../dashboard/agent-chat.md), chart `dashboard` / `docs`                                                                                                   |
| **`clawql-mcp` MCP server**                                  | ✅ Shipped | npm `clawql-mcp`, Streamable HTTP `/mcp`                                                                                                                                  |
| **`ingest_external_knowledge` + `DEFAULT_IDP_PIPELINE`**     | ✅ Shipped | [idp-pipeline.md](../providers/idp-pipeline.md) — agent-composed `search`/`execute`; automated runner [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307) |
| **Presidio / sparse-MoE agent I/O redaction**                | 📋 Partial | [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)                                                                                                       |
| **Tier 1 four-stack Docker Compose**                         | 📋 Planned | [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251) — use Helm today                                                                                      |
| **Kubernetes Operator + `ClawQLInstance` CRD**               | 📋 Planned | [operator-target-architecture.md](../design/operator-target-architecture.md)                                                                                              |
| **Goose / Printing Press / vertical packages**               | 📋 Planned | —                                                                                                                                                                         |

### Choose a deployment path

| Need                                      | Use today                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Local full IDP stack** (Docker Desktop) | `make local-k8s-up` → [helm.md](helm.md)                                                   |
| **Minimal MCP only**                      | `npx clawql-mcp` or `npm run start:http` + `.env`                                          |
| **Remote Kubernetes**                     | [deploy-k8s.md](deploy-k8s.md) or Helm with your values                                    |
| **Operator / multi-tenant CRD model**     | Design only — [operator-target-architecture.md](../design/operator-target-architecture.md) |

---

## Quick start (Helm — recommended)

From a repo clone:

```bash
make local-k8s-up
```

Uses **`charts/clawql-mcp/values-docker-desktop.yaml`**: MCP at `http://clawql-mcp.localhost/mcp`, dashboard at `http://clawql.localhost`, document pipeline + optional Onyx + Nextcloud enabled by default.

Production-style install:

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

See [helm.md](helm.md) for values, secrets (External Secrets + Vault), optional NATS/Flink/Onyx, and **`idpCollaboration`**.

### Verify health

```bash
curl -s http://clawql-mcp.localhost/healthz    # or your Ingress / port-forward URL
curl -s http://clawql.localhost/api/k8s/health # dashboard pod
```

MCP smoke (Streamable HTTP):

```bash
curl -s -X POST http://clawql-mcp.localhost/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Configuration essentials

| Concern                | Shipped approach                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Provider tokens**    | Kubernetes `Secret` via **`envFromSecret`** / **`extraEnv`**; production: Vault → ESO ([helm.md](helm.md)) |
| **Document stack off** | `enableDocuments: false` or `CLAWQL_ENABLE_DOCUMENTS=0`                                                    |
| **Vault memory off**   | `enableMemory: false` or `CLAWQL_ENABLE_MEMORY=0`                                                          |
| **Onyx search tool**   | `enableOnyx: true` + `ONYX_BASE_URL` + token                                                               |
| **IDP collaboration**  | `idpCollaboration.enabled: true` (Nextcloud; Coneshare via `externalUrl` in prod)                          |
| **Feature tiers**      | [configuration.md § Feature tiers](../readme/configuration.md#feature-tiers-architecture-diagram)          |

Base URLs for document vendors are injected by the chart when subcharts are enabled — see [idp-pipeline.md § Helm](../providers/idp-pipeline.md#helm-enable-the-full-stack).

---

## Day-2 operations (Helm)

### Upgrade

```bash
helm upgrade clawql ./charts/clawql-mcp -n clawql -f your-values.yaml --wait
```

Image tags: set **`image.tag`** (MCP), **`documentPipeline.*.image.tag`**, **`onyx.*.image.tag`** as needed. Prefer rolling upgrades with **`--wait`** and watch **`kubectl -n clawql get pods`**.

### Secrets rotation

1. Update the Vault KV entry or Kubernetes `Secret` (ESO reconciles on interval).
2. Restart MCP if env is not hot-reloaded: `kubectl -n clawql rollout restart deploy/clawql-mcp-http`.

Document pipeline tokens (`PAPERLESS_API_TOKEN`, `STIRLING_API_KEY`, `NEXTCLOUD_*`, `CONESHARE_API_TOKEN`) live on chart-managed Secrets when **`auth.*`** blocks are set — see [helm.md](helm.md).

### Scale

Adjust **`replicas`** on the MCP Deployment in values, or `kubectl scale` for quick tests. Document services (Tika, Gotenberg, Stirling) have their own Deployments under **`documentPipeline`** — scale independently under load.

### Observability

- **`GET /metrics`** on MCP HTTP — [Grafana dashboard](../grafana/README.md) ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210))
- Docker Desktop stack: [docker-desktop-observability](../docker/docker-desktop-observability.md)

### Troubleshooting

Start with [troubleshooting](../readme/troubleshooting.md) and [helm.md](helm.md). Common checks: provider auth env, bundled spec load (`CLAWQL_PROVIDER`), Ingress host DNS, and Paperless token from Profile / `POST /api/token/` (not only chart placeholder secrets).

---

## Local MCP without Kubernetes

```bash
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL
npm ci && npm run build
cp .env.example .env   # set TIKA_BASE_URL, PAPERLESS_API_TOKEN, etc.
npm run start:http
```

Default provider merge is **`all-providers`** (includes all seven IDP vendors unless **`CLAWQL_ENABLE_DOCUMENTS=0`**).

---

## Planned architecture (not in this guide)

The following were drafted for a future **ClawQL Operator** and are **not implemented**:

- Three-tier model (Compose / standard K8s / enterprise Kata+Istio+Vault)
- **`ClawQLInstance` CRD** and vertical enablement via spec patches
- Natural-language `@hermes` operations → CRD patches
- Goose, Printing Press, vertical packages

Full specification: **[Operator target architecture](../design/operator-target-architecture.md)**.

---

## Related documentation

| Topic                     | Link                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| Helm chart                | [helm.md](helm.md)                                                           |
| Kustomize / K8s           | [deploy-k8s.md](deploy-k8s.md)                                               |
| IDP seven-vendor stack    | [idp-pipeline.md](../providers/idp-pipeline.md)                              |
| Operator design (planned) | [operator-target-architecture.md](../design/operator-target-architecture.md) |
| Vision & roadmap          | [clawql-vision-roadmap.md](../vision/clawql-vision-roadmap.md)               |

---

_ClawQL Deployment & Operations Guide · June 2026 · Apache 2.0 / MIT_

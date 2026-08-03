DeploymentHelm · shipped


# ClawQL — Deployment & Operations Guide

**For platform engineers and operators · June 2026**
Apache 2.0 / MIT · [github.com/danielsmithdevelopment/ClawQL](https://github.com/danielsmithdevelopment/ClawQL)

Operator-focused tier docs and natural-language ops tables are in **[Operator target architecture (design)](https://docs.clawql.com/design/operator-target-architecture)**. An opt-in operator scaffold (CRD + reconcile + tier-spec ConfigMaps) is available separately — see **[clawql-operator-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-operator-helm.md)** ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)).

---

## Before you start

### What you can deploy today

| Component | Status | Canonical doc |
|---|---|---|
| **Helm chart `clawql-mcp`** | ✅ Shipped | [helm.md](https://docs.clawql.com/helm) |
| **Document pipeline** (Tika, Gotenberg, Stirling, Paperless) | ✅ Shipped | [idp-pipeline.md](https://docs.clawql.com/learn/document-pipeline), `documentPipeline.enabled` |
| **Onyx** (optional + `knowledge_search_onyx`) | ✅ Shipped | [onyx-knowledge-tool.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/onyx-knowledge-tool.md) |
| **Nextcloud + Coneshare** (`idpCollaboration`) | ✅ Shipped | [nextcloud-onboarding.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/nextcloud-onboarding.md), [coneshare-onboarding.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/coneshare-onboarding.md) |
| **Dashboard + docs UI** | ✅ Shipped | [agent-chat.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/dashboard/agent-chat.md), chart `dashboard` / `docs` |
| **`clawql-mcp` MCP server** | ✅ Shipped | npm `clawql-mcp`, Streamable HTTP `/mcp` |
| **`ingest_external_knowledge` + `DEFAULT_IDP_PIPELINE`** | ✅ Shipped | [idp-pipeline.md](https://docs.clawql.com/learn/document-pipeline) — agent-composed `search`/`execute`; automated runner [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307) |
| **Presidio / sparse-MoE agent I/O redaction** | 📋 Partial | [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245) |
| **Tier 1 four-stack Docker Compose** | 📋 Planned | [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251) — use Helm today |
| **Kubernetes Operator + `ClawQLInstance` CRD** | 🚧 Opt-in scaffold | [clawql-operator-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-operator-helm.md), [operator-target-architecture.md](https://docs.clawql.com/design/operator-target-architecture) |
| **Goose / Printing Press / vertical packages** | 📋 Planned | — |

### Choose a deployment path

| Need | Use today |
|---|---|
| **Local full IDP stack** (Docker Desktop) | `make local-k8s-up` → [helm.md](https://docs.clawql.com/helm) |
| **Minimal MCP only** | `npx clawql-mcp` or `npm run start:http` + `.env` |
| **Remote Kubernetes** | [deploy-k8s.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/deploy-k8s.md) or Helm with your values |
| **Operator / multi-tenant CRD model** | Opt-in — [clawql-operator-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-operator-helm.md) (Helm/env remain default) |

---

## Quick start (Helm — recommended)

From a repo clone:

```bash
make local-k8s-up
```

Uses `charts/clawql-mcp/values-docker-desktop.yaml`: MCP at `http://clawql-mcp.localhost/mcp`, dashboard at `http://clawql.localhost`, document pipeline + optional Onyx + Nextcloud enabled by default.

Production-style install:

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

See [helm.md](https://docs.clawql.com/helm) for values, secrets (External Secrets + Vault), optional NATS/Flink/Onyx, and `idpCollaboration`.

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

| Concern | Shipped approach |
|---|---|
| **Provider tokens** | Kubernetes `Secret` via `envFromSecret` / `extraEnv`; production: Vault → ESO ([helm.md](https://docs.clawql.com/helm)) |
| **Document stack off** | `enableDocuments: false` or `CLAWQL_ENABLE_DOCUMENTS=0` |
| **Vault memory off** | `enableMemory: false` or `CLAWQL_ENABLE_MEMORY=0` |
| **Onyx search tool** | `enableOnyx: true` + `ONYX_BASE_URL` + token |
| **IDP collaboration** | `idpCollaboration.enabled: true` (Nextcloud; Coneshare via `externalUrl` in prod) |
| **Feature tiers** | [configuration.md § Feature tiers](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/readme/configuration.md#feature-tiers-architecture-diagram) |

Base URLs for document vendors are injected by the chart when subcharts are enabled — see [idp-pipeline.md § Helm](https://docs.clawql.com/learn/document-pipeline#helm-enable-the-full-stack).

---

## Day-2 operations (Helm)

### Upgrade

```bash
helm upgrade clawql ./charts/clawql-mcp -n clawql -f your-values.yaml --wait
```

Image tags: set `image.tag` (MCP), `documentPipeline.*.image.tag`, `onyx.*.image.tag` as needed. Prefer rolling upgrades with `--wait` and watch `kubectl -n clawql get pods`.

### Secrets rotation

1. Update the Vault KV entry or Kubernetes `Secret` (ESO reconciles on interval).
2. Restart MCP if env is not hot-reloaded: `kubectl -n clawql rollout restart deploy/clawql-mcp-http`.

Document pipeline tokens (`PAPERLESS_API_TOKEN`, `STIRLING_API_KEY`, `NEXTCLOUD_*`, `CONESHARE_API_TOKEN`) live on chart-managed Secrets when `auth.*` blocks are set — see [helm.md](https://docs.clawql.com/helm).

### Scale

Adjust `replicas` on the MCP Deployment in values, or `kubectl scale` for quick tests. Document services (Tika, Gotenberg, Stirling) have their own Deployments under `documentPipeline` — scale independently under load.

### Observability

- `GET /metrics` on MCP HTTP — [Grafana dashboard](https://docs.clawql.com/learn/audit-tool-and-observability) ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210))
- Docker Desktop stack: [docker-desktop-observability](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/docker/docker-desktop-observability.md)

### Troubleshooting

Start with [troubleshooting](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/readme/troubleshooting.md) and [helm.md](https://docs.clawql.com/helm). Common checks: provider auth env, bundled spec load (`CLAWQL_PROVIDER`), Ingress host DNS, and Paperless token from Profile / `POST /api/token/` — the chart placeholder secrets are a starting point, the actual token comes from Paperless itself.

---

## Local MCP without Kubernetes

```bash
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL
npm ci && npm run build
cp .env.example .env   # set TIKA_BASE_URL, PAPERLESS_API_TOKEN, etc.
npm run start:http
```

When no spec env is set, the opinionated default stack loads (Cloudflare, GitHub, Slack, Linear, Notion, Onyx). Helm `provider: default` matches npm. Use `CLAWQL_PROVIDER=all-providers` or `helm --set provider=all-providers` for every bundled vendor plus Google top-50 and AWS top-50.

---

## Operator scaffold (opt-in, shipped 7.0.0)

The operator scaffold reconciles `ClawQLInstance` CRs to tier-spec ConfigMaps and optionally rolls MCP when `spec.mcp.rolloutOnTierSpecChange` is set. Helm `CLAWQL_ENABLE_*` workflows remain the default when the operator is not installed.

1. Install CRD + reconcile: [clawql-operator-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-operator-helm.md)
2. Apply a `ClawQLInstance` (`examples/operator/clawqlinstance-minimal.yaml`)
3. Mount the published tier-spec ConfigMap on MCP (`instanceSpec.enabled: true`)

Full tier/vertical/auth reconciliation and NL ops are in **[Operator target architecture](https://docs.clawql.com/design/operator-target-architecture)** (roadmap).

---

## Related documentation

| Topic | Link |
|---|---|
| Helm chart | [helm.md](https://docs.clawql.com/helm) |
| Kustomize / K8s | [deploy-k8s.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/deploy-k8s.md) |
| IDP eight-vendor stack | [idp-pipeline.md](https://docs.clawql.com/learn/document-pipeline) · [clawql-idp-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-idp-helm.md) · [observability/README.md](https://docs.clawql.com/docker-desktop-observability) |
| Operator scaffold (opt-in) | [clawql-operator-helm.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/clawql-operator-helm.md) |
| Operator design (full roadmap) | [operator-target-architecture.md](https://docs.clawql.com/design/operator-target-architecture) |
| Vision & roadmap | [clawql-vision-roadmap.md](https://docs.clawql.com/vision/roadmap) |

---

*ClawQL Deployment & Operations Guide · June 2026 · Apache 2.0 / MIT*

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)

# `clawql-mcp` Helm chart

Deploys **ClawQL** as **`clawql-mcp-http`**: Streamable HTTP MCP (`/mcp`), health (`/healthz`), GraphQL (`/graphql`), optional gRPC on **50051**. Optionally deploys a UI workload from the `website` image with host-based Ingress (for example, `http://clawql.localhost`).

## Documentation

- **Full guide:** [`docs/deployment/helm.md`](../../docs/deployment/helm.md) in this repository
- **Kustomize alternative:** [`docs/deployment/deploy-k8s.md`](../../docs/deployment/deploy-k8s.md)

## Quick install

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

Configure via **`values.yaml`** or **`--set`**. Defaults pull **`ghcr.io/danielsmithdevelopment/clawql-mcp:latest`**. **`enableMemory`** and **`enableDocuments`** default to **`true`**. Set either to **`false`** to inject **`CLAWQL_ENABLE_MEMORY=0`** or **`CLAWQL_ENABLE_DOCUMENTS=0`** (hide vault memory tools or the document stack + related MCP tools). **ClawQL Core** includes **`search`**, **`execute`**, **`audit`**, and **`cache`** — Core tools cannot be disabled via the chart ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)). **`enableNotify`** defaults to **`false`** — set **`true`** for MCP **`notify`** (Slack **`chat.postMessage`**; [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); supply **`CLAWQL_SLACK_TOKEN`** (or equivalent) via **`extraEnv`** / **`envFromSecret`**. **`enableOnyx`** defaults to **`false`** — set **`true`** for MCP **`knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); set **`onyxBaseUrl`** and **`ONYX_API_TOKEN`** via **`extraEnv`** / Secret. **`enableOuroboros`** defaults to **`false`** — set **`true`** for MCP **`ouroboros_*`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); optional **`ouroborosDatabaseUrl`** / **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events or enable **`ouroborosPostgres.enabled=true`** to deploy Postgres alongside ClawQL in the same release ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). **`nats.enabled`** defaults to **`false`** — set **`true`** to deploy in-cluster NATS JetStream for event-driven Ouroboros/agent/edge sync workflows ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)). The full document pipeline stack (`documentPipeline.enabled`, including Paperless + in-cluster stores) is enabled by default; disable it explicitly if you want a minimal ClawQL-only footprint.

**Docker Desktop:** from the repo root, **`make local-k8s-up`** uses **`values-docker-desktop.yaml`** (LoadBalancer **8080**, **`hostPath`** vault, UI Ingress on **`clawql.localhost`**).
The script builds **`clawql-website:latest`** from `website/` by default and installs/upgrades **ingress-nginx** unless disabled.
**Kustomize:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** uses **`docker/kustomize/overlays/local`** (no Helm).

## NATS JetStream quick ops

Issue [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127) adds optional in-cluster NATS JetStream as an event backbone for Ouroboros, agent orchestration, and edge synchronization.

Enable:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=true \
  --set nats.persistence.enabled=true \
  --set nats.persistence.size=20Gi
```

Verify:

```bash
kubectl -n clawql get deploy,svc,pvc | rg nats
kubectl -n clawql logs deploy/clawql-mcp-http-nats
kubectl -n clawql get deploy clawql-mcp-http -o yaml | rg "CLAWQL_NATS_URL|CLAWQL_NATS_JETSTREAM" -n
```

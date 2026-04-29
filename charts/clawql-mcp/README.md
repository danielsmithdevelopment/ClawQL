# `clawql-mcp` Helm chart

Deploys **ClawQL** as **`clawql-mcp-http`**: Streamable HTTP MCP (`/mcp`), health (`/healthz`), **`/graphql`** (OpenAPI-derived introspection for debugging), optional **MCP** transport on **50051** (**`mcp-grpc-transport`** — not application gRPC backends; those use **`CLAWQL_GRPC_SOURCES`** in env). Set **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`** (and optional **`CLAWQL_GRAPHQL_SCHEMA_PATH`** / **`CLAWQL_GRAPHQL_INTROSPECTION_PATH`** / **`CLAWQL_GRAPHQL_URL`**) via **`extraEnv`** / Secrets for native protocols; bundled GraphQL-only **`linear`** uses on-image **`providers/linear/schema.graphql`** — set **`LINEAR_API_KEY`** / **`CLAWQL_LINEAR_API_KEY`** for **`execute`**. Optionally deploys a UI workload from the `website` image with host-based Ingress (for example, `http://clawql.localhost`).

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

Configure via **`values.yaml`** or **`--set`**. Defaults pull **`ghcr.io/danielsmithdevelopment/clawql-mcp:latest`**. **`enableMemory`** and **`enableDocuments`** default to **`true`**. Set either to **`false`** to inject **`CLAWQL_ENABLE_MEMORY=0`** or **`CLAWQL_ENABLE_DOCUMENTS=0`** (hide vault memory tools or the document stack + related MCP tools). **ClawQL Core** includes **`search`**, **`execute`**, **`audit`**, and **`cache`** — Core tools cannot be disabled via the chart ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)). **`enableNotify`** defaults to **`false`** — set **`true`** for MCP **`notify`** (Slack **`chat.postMessage`**; [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); supply **`CLAWQL_SLACK_TOKEN`** (or equivalent) via **`extraEnv`** / **`envFromSecret`**. **`enableOnyx`** defaults to **`false`** — set **`true`** for MCP **`knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); set **`onyxBaseUrl`** and **`ONYX_API_TOKEN`** via **`extraEnv`** / Secret. **`enableSandbox`** defaults to **`false`** — set **`true`** to inject **`CLAWQL_ENABLE_SANDBOX=1`** for MCP **`sandbox_exec`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)); set **`CLAWQL_SANDBOX_BRIDGE_URL`** / token and/or **`CLAWQL_SANDBOX_BACKEND`** via **`extraEnv`** / Secret. **`enableOuroboros`** defaults to **`false`** — set **`true`** for MCP **`ouroboros_*`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); optional **`ouroborosDatabaseUrl`** / **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events or enable **`ouroborosPostgres.enabled=true`** to deploy Postgres alongside ClawQL in the same release ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). **`nats.enabled`** defaults to **`false`** — set **`true`** to deploy in-cluster NATS JetStream for event-driven Ouroboros/agent/edge sync workflows ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)). The full document pipeline stack (`documentPipeline.enabled`, including Paperless + in-cluster stores) is enabled by default; disable it explicitly if you want a minimal ClawQL-only footprint.

**Kyverno (default on):** the chart renders a **`ClusterPolicy`** (**`verifyImages`**) for **`ghcr.io/.../clawql-mcp*`** and **`clawql-website*`** by default (**`kyverno.imageSignaturePolicy.enabled: true`** in [values](values.yaml)). Install **Kyverno** in the cluster first, or set **`kyverno.imageSignaturePolicy.enabled=false`**. **`make local-k8s-up`** installs Kyverno on Docker Desktop. See **[`docs/security/image-signature-enforcement.md`](../../docs/security/image-signature-enforcement.md)**.

**Docker Desktop:** from the repo root, **`make local-k8s-up`** uses **`values-docker-desktop.yaml`** (LoadBalancer **8080**, **`hostPath`** vault, UI Ingress on **`clawql.localhost`**, signed **`ghcr.io/.../clawql-website`**, **Kyverno** + **`verifyImages`** enforcement in the release namespace).
The script installs **Kyverno** and upgrades **ingress-nginx** unless disabled.
**Kustomize:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** uses **`docker/kustomize/overlays/local`** (no Helm).

## Prometheus: scrape `GET /metrics`

ClawQL exposes **OpenMetrics** on **`GET /metrics`** (native GraphQL/gRPC counters/gauges; see **`docs/readme/deployment.md`**).

- **Istio sample Prometheus** (`istio-system`, from **`samples/addons/prometheus.yaml`**): discovers annotated **Services** via the **`kubernetes-service-endpoints`** scrape job. This chart defaults **`metrics.prometheusScrapeAnnotations.enabled: true`**, which sets **`prometheus.io/scrape`**, **`prometheus.io/path`**, and **`prometheus.io/port`** on **`svc/<fullname>`** (port defaults to **`service.http.targetPort`** — the HTTP container listen port). After **`helm upgrade`**, Istio’s Prometheus should list a **`clawql`** target without editing its ConfigMap. Set **`metrics.prometheusScrapeAnnotations.enabled: false`** to disable. If **`CLAWQL_DISABLE_HTTP_METRICS=1`**, `/metrics` is omitted — turn off scrape annotations or fix env before relying on this path.
- **Prometheus Operator:** set **`metrics.serviceMonitor.enabled: true`** to render a **`ServiceMonitor`** (**`monitoring.coreos.com/v1`**) on **`port: http`**, path **`metrics.prometheusScrapeAnnotations.path`**. Tune **`metrics.serviceMonitor.labels`** so your **`Prometheus`** CR selects this object. Requires the **ServiceMonitor** CRD in the cluster.
- **Grafana:** import **`docs/grafana/clawql-core-observability.json`** — see **`docs/grafana/README.md`** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

## NATS JetStream quick ops

Issue [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127) adds optional in-cluster NATS JetStream as an event backbone for Ouroboros, agent orchestration, and edge synchronization.

**Subject roots** (streams are app-owned; defaults in **`values.yaml`** → **`nats.subjectConvention`**):

- `clawql.workflow` — workflow / Ouroboros checkpoints
- `clawql.agent` — agent coordination
- `clawql.document` — document pipeline events
- `clawql.edge` — edge worker sync

Deep dive (retention guidance, Prometheus notes, integration links): **[`docs/deployment/helm.md`](../../docs/deployment/helm.md#nats-jetstream-deep-dive)** (**Subject naming** → [`#subject-naming-deck-aligned`](../../docs/deployment/helm.md#subject-naming-deck-aligned)). Public site mirror: **`/nats-jetstream`** on [clawql.io](https://clawql.com).

Enable:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=true \
  --set nats.persistence.enabled=true \
  --set nats.persistence.size=20Gi
```

Verify (resource names assume default **`fullnameOverride: clawql-mcp-http`**):

```bash
kubectl -n clawql get deploy,svc,pvc | rg nats
kubectl -n clawql logs deploy/clawql-mcp-http-nats
kubectl -n clawql port-forward svc/clawql-mcp-http-nats 8222:8222
curl -s http://127.0.0.1:8222/healthz
curl -s http://127.0.0.1:8222/jsz | head -c 500
kubectl -n clawql get deploy clawql-mcp-http -o yaml | rg "CLAWQL_NATS_URL|CLAWQL_NATS_JETSTREAM" -n
```

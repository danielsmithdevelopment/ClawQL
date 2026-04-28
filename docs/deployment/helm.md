# Helm chart (`charts/clawql-mcp`)

The repository ships a **Helm 3** chart that deploys the same workload as Kustomize (**`clawql-mcp-http`**): Streamable HTTP MCP (and optional gRPC) behind a Kubernetes **Service**. The chart can also deploy a UI workload and expose it through a host-based Ingress.

Use this when you prefer **`helm install` / `helm upgrade`** over **`kubectl apply -k`** (see also [`deploy-k8s.md`](deploy-k8s.md) for Kustomize).

**Feature tiers** (Core vs default-on opt-out vs opt-in): **[`docs/readme/configuration.md` § Feature tiers](../readme/configuration.md#feature-tiers-architecture-diagram)**. **ClawQL Core** (`search`, `execute`, `audit`, `cache`) has **no** chart toggles. Keys **`enableMemory`** and **`enableDocuments`** inject **`CLAWQL_ENABLE_MEMORY=0`** or **`CLAWQL_ENABLE_DOCUMENTS=0`** when **`false`**.

## Prerequisites

- Kubernetes 1.24+ (typical for `networking.k8s.io/v1` Ingress)
- [Helm 3](https://helm.sh/)
- **[Kyverno](https://kyverno.io/)** installed in the cluster (CRDs + controller) if you use the chart default **`kyverno.imageSignaturePolicy.enabled: true`** — otherwise **`helm install`** applies a **`ClusterPolicy`** the API server cannot store until Kyverno is present. Clusters without Kyverno: **`--set kyverno.imageSignaturePolicy.enabled=false`**. Context: **[`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)** and **[`docs/security/image-signature-enforcement.md`](../security/image-signature-enforcement.md)**.
- An image your cluster can pull (default: **`ghcr.io/danielsmithdevelopment/clawql-mcp`**, multi-arch **amd64** / **arm64** when published from CI)

Private GHCR: create a pull secret and set **`imagePullSecrets`** (see [values](../charts/clawql-mcp/values.yaml)).

### Kyverno image signatures (default on)

The chart **renders a `ClusterPolicy`** (**`verifyImages`**, Cosign keyless) for default **`ghcr.io/.../clawql-mcp*`** and **`clawql-website*`** when **`kyverno.imageSignaturePolicy.enabled`** is **`true`** (the **default** in [`values.yaml`](../charts/clawql-mcp/values.yaml)). Install **Kyverno** before upgrading ClawQL, or opt out:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set kyverno.imageSignaturePolicy.enabled=false
```

Forks and custom registries: override **`kyverno.imageSignaturePolicy.imageReferences`** and **`kyverno.imageSignaturePolicy.cosign`** regexes in values or an overlay. **`make local-k8s-up`** installs Kyverno for Docker Desktop. **CI → admission story:** **[`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)**; policy fields and caveats: **[`docs/security/image-signature-enforcement.md`](../security/image-signature-enforcement.md)**.

## Install from a repo clone

From the **repository root**:

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

Defaults use **`fullnameOverride: clawql-mcp-http`** so resource names match the Kustomize docs (**`kubectl -n clawql get deploy clawql-mcp-http`**).

### Examples

**ClusterIP** (in-cluster only, no cloud LoadBalancer cost):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set service.type=ClusterIP \
  --set service.http.port=8080
```

**Enable gRPC** (port **50051** on the Service; HTTP unchanged):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set enableGrpc=true
```

**Image tag** (pin a digest or release tag):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set image.tag=sha-abc1234
```

**Tokens via existing Secret** (keys become env vars in the pod):

```bash
kubectl -n clawql create secret generic clawql-env --from-literal=CLAWQL_GITHUB_TOKEN="$(gh auth token)"
helm upgrade --install clawql ./charts/clawql-mcp -n clawql \
  --set envFromSecret=clawql-env
```

**Persistent vault** (`memory_ingest` / `memory_recall` survive pod restarts):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set persistence.enabled=true \
  --set persistence.size=20Gi
```

**Enable Ouroboros with in-cluster Postgres** (deployed alongside ClawQL):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set enableOuroboros=true \
  --set ouroborosPostgres.enabled=true \
  --set ouroborosPostgres.auth.password='replace-me'
```

**Disable document pipeline + backing stores** (if you want a minimal ClawQL-only install):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set documentPipeline.enabled=false \
  --set stores.postgres.enabled=false \
  --set stores.redis.enabled=false
```

**Enable in-cluster Flink for Onyx sync** (internal service, no public ingress by default):

```bash
kubectl -n clawql create secret generic onyx-connector-env \
  --from-literal=ONYX_API_TOKEN='replace-me'

helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set flink.enabled=true \
  --set flink.connectorSecret=onyx-connector-env
```

**Enable in-cluster NATS JetStream event backbone** (Ouroboros + agent + edge sync):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=true \
  --set nats.persistence.enabled=true \
  --set nats.persistence.size=20Gi
```

## NATS JetStream deep dive

The chart-level NATS integration is intentionally conservative: one in-cluster NATS server with JetStream enabled, optional persistence, and automatic env injection into `clawql-mcp-http`.

### What Helm deploys

With `nats.enabled=true`, templates render:

- `ConfigMap/<release>-nats-config` with `nats-server.conf`
- `Service/<release>-nats` exposing client (`4222`), cluster (`6222`), monitor (`8222`)
- `Deployment/<release>-nats` (single replica)
- Optional `PersistentVolumeClaim/<release>-nats-data` when `nats.persistence.enabled=true`

### App wiring behavior

`clawql-mcp-http` receives:

- `CLAWQL_NATS_URL` from:
  - `nats.url` if provided (external cluster), otherwise
  - in-cluster DNS (`nats://<release>-nats:<clientPort>`) when enabled
- `CLAWQL_NATS_JETSTREAM=1` when `nats.jetStream.enabled=true`

This means you can switch between in-cluster and external NATS by value changes alone, without editing deployment templates.

### Recommended rollout profiles

**Local/smoke profile:**

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=true
```

**Durable baseline profile:**

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=true \
  --set nats.persistence.enabled=true \
  --set nats.persistence.size=50Gi \
  --set nats.jetStream.maxMemoryStore=512Mi \
  --set nats.jetStream.maxFileStore=40Gi
```

**External managed NATS profile:**

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set nats.enabled=false \
  --set-string nats.url='nats://nats.shared.svc.cluster.local:4222'
```

### Operational guardrails

- Keep `nats.service.type=ClusterIP` for internal-only traffic.
- Treat `nats.persistence.enabled=false` as ephemeral mode only.
- Set `nats.jetStream.maxFileStore` lower than PVC size (leave filesystem headroom).
- Restrict monitor port (`8222`) to trusted internal networks.
- Document stream retention/consumer ack policy in the app layer so storage growth is predictable.

### Validate before/after deploy

Template check:

```bash
helm template test charts/clawql-mcp -n clawql --set nats.enabled=true | rg "nats|jetstream"
```

Post-deploy checks:

```bash
kubectl -n clawql get deploy,svc,pvc | rg nats
kubectl -n clawql logs deploy/clawql-mcp-http-nats
kubectl -n clawql port-forward svc/clawql-mcp-http-nats 8222:8222
curl -s http://127.0.0.1:8222/healthz
kubectl -n clawql get deploy clawql-mcp-http -o yaml | rg "CLAWQL_NATS_URL|CLAWQL_NATS_JETSTREAM" -n
```

**Ingress** (optional): set **`ingress.enabled=true`** and edit **`ingress.hosts`** / **`ingress.tls`** in a small values file; backend targets the HTTP **`service.http.port`**.

**UI + Ingress** (optional): set **`ui.enabled=true`** and **`ui.ingress.enabled=true`** to deploy a separate UI Deployment/Service and route a host (default: **`clawql.localhost`**) to it.

## Production hardening (default full-stack install)

The chart now enables document pipeline + stores by default, including in-cluster Postgres for Paperless. Before production use:

- Replace the default **`stores.postgres.auth.password`** immediately.
- Prefer **`stores.postgres.auth.existingSecret`** over inline values.
- If you do not need in-cluster stores/pipeline, disable them explicitly (`documentPipeline.enabled=false`, `stores.postgres.enabled=false`, `stores.redis.enabled=false`).

## Access bundled docs locally (Docker Desktop)

When you use the local Helm flow (`make local-k8s-up`), the chart can deploy the `website` UI and expose it through ingress-nginx.

- Docs UI: **`http://clawql.localhost`**
- MCP endpoint: **`http://localhost:8080/mcp`**

Quick verify:

```bash
curl -s http://clawql.localhost/api/health
```

Expected response includes **`{"status":"ok"}`**.

## Values

See **[`charts/clawql-mcp/values.yaml`](../charts/clawql-mcp/values.yaml)**. Common keys:

| Key                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image.repository`, `image.tag`, `image.pullPolicy` | Container image                                                                                                                                                                                                                                                                                                                                                                                                       |
| `service.type`, `service.http.port`                 | `LoadBalancer` vs `ClusterIP`, front port                                                                                                                                                                                                                                                                                                                                                                             |
| `provider`                                          | **`CLAWQL_PROVIDER`** (e.g. `google`, `all-providers`; default **`all-providers`**) — for custom id lists, set container env **`CLAWQL_BUNDLED_PROVIDERS`**.                                                                                                                                                                                                                                                          |
| `enableGrpc` / `enableGrpcReflection`               | gRPC listener on **50051**                                                                                                                                                                                                                                                                                                                                                                                            |
| `enableMemory`                                      | When **`false`**, sets **`CLAWQL_ENABLE_MEMORY=0`** (hides vault tools). Default **`true`**. See [memory-obsidian.md](memory-obsidian.md)                                                                                                                                                                                                                                                                             |
| `enableDocuments`                                   | When **`false`**, sets **`CLAWQL_ENABLE_DOCUMENTS=0`** (omits tika / gotenberg / paperless / stirling / onyx from **`all-providers`**; hides **`ingest_external_knowledge`** and **`knowledge_search_onyx`**). Default **`true`** — [mcp-tools.md](mcp-tools.md)                                                                                                                                                      |
| `enableNotify`                                      | **`CLAWQL_ENABLE_NOTIFY=1`** — MCP **`notify`** (Slack **`chat.postMessage`**; default **false**; [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); set **`CLAWQL_SLACK_TOKEN`** via **`extraEnv`** / Secret — **[notify-tool.md](notify-tool.md)**                                                                                                                                                 |
| `enableOnyx` / `onyxBaseUrl`                        | **`CLAWQL_ENABLE_ONYX=1`** — MCP **`knowledge_search_onyx`** (default **false**; [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); **`onyxBaseUrl`** sets **`ONYX_BASE_URL`**. Supply **`ONYX_API_TOKEN`** (Bearer) via **`extraEnv`** / Secret — **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)**                                                                                            |
| `enableOuroboros` / `ouroborosDatabaseUrl`          | **`CLAWQL_ENABLE_OUROBOROS=1`** — MCP **`ouroboros_*`** (default **false**; [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); **`ouroborosDatabaseUrl`** sets **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). Prefer Secret-backed env when the URL contains credentials — **[mcp-tools.md](mcp-tools.md)** |
| `ouroborosPostgres.*`                               | Optional Postgres workload in the same release for durable Ouroboros events ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). When enabled, chart wires **`CLAWQL_OUROBOROS_DB_*`** env vars from Service + Secret into `clawql-mcp` (no credential-in-URL required).                                                                                                                            |
| `documentPipeline.*`                                | Full-stack document pipeline workloads (**Tika**, **Gotenberg**, **Stirling**, **Paperless**) with in-cluster base URLs injected into ClawQL for integrated deployments. Enabled by default; disable explicitly for minimal installs ([#113](https://github.com/danielsmithdevelopment/ClawQL/issues/113)).                                                                                                           |
| `stores.*`                                          | In-cluster backing stores for full-stack topology (**Postgres**, **Redis**). Enabled by default; required when `documentPipeline.paperless.enabled=true`.                                                                                                                                                                                                                                                             |
| `flink.*`                                           | Optional in-cluster Apache Flink topology for real-time Onyx connector sync ([#119](https://github.com/danielsmithdevelopment/ClawQL/issues/119)). Deploys JobManager + TaskManagers + internal Service (ClusterIP default). Use `flink.connectorSecret` to scope connector credentials to Flink pods only.                                                                                                           |
| `nats.*`                                            | Optional in-cluster NATS JetStream deployment for durable event streaming across Ouroboros, agent orchestration, and edge worker sync ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)). Injects `CLAWQL_NATS_URL` into `clawql-mcp` when enabled (or from `nats.url` for external NATS).                                                                                                         |
| `extraEnv`                                          | Additional container env entries                                                                                                                                                                                                                                                                                                                                                                                      |
| `envFromSecret`                                     | **`envFrom`** from an existing Secret                                                                                                                                                                                                                                                                                                                                                                                 |
| `persistence`                                       | PVC for **`/vault`** instead of **`emptyDir`**                                                                                                                                                                                                                                                                                                                                                                        |
| `vault.hostPath`                                    | Host directory bind for **`/vault`** (Docker Desktop; mutually exclusive with **`persistence`**)                                                                                                                                                                                                                                                                                                                      |
| `ingress`                                           | Optional HTTP(S) Ingress                                                                                                                                                                                                                                                                                                                                                                                              |
| `ui`                                                | Optional UI Deployment/Service/Ingress (defaults for Docker Desktop use `clawql.localhost`)                                                                                                                                                                                                                                                                                                                           |

**Docker Desktop:** **`make local-k8s-up`** installs **Kyverno**, then **`helm upgrade --install`** with **`values-docker-desktop.yaml`** (LoadBalancer **8080**, **`all-providers`**, **`vault.hostPath.path`** = **`$HOME/.ClawQL`**, UI Ingress **`clawql.localhost`**, signed **`ghcr.io/.../clawql-mcp`** and **`clawql-website`**, **`kyverno.imageSignaturePolicy`** enabled with **`matchReleaseNamespaceOnly: true`**). **ingress-nginx** installs unless **`CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=0`**. **Kustomize** for the MCP manifest: **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** — Helm is still required for Kyverno and for templating the **ClusterPolicy**. Unsigned local image build env vars are **not** supported (script exits).

## Lint and template (CI / local)

```bash
make helm-lint
```

Or:

```bash
helm lint charts/clawql-mcp
helm template test charts/clawql-mcp --namespace clawql
```

## Uninstall

```bash
helm uninstall clawql -n clawql
```

If you used persistence with a chart-managed PVC, remove the PVC separately if you no longer need the data.

## Relationship to Kustomize

|                    | Kustomize (`docker/kustomize/`)            | Helm (`charts/clawql-mcp`)                                                 |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| **Naming**         | Overlays **`dev`**, **`prod`**, **`base`** | **`values.yaml`** + **`--set`**                                            |
| **Image**          | Rewritten by **`scripts/deploy-k8s.sh`**   | **`image.repository`** / **`image.tag`**                                   |
| **Docker Desktop** | Optional **`overlays/local`**              | **Default** — **`values-docker-desktop.yaml`** via **`make local-k8s-up`** |

Remote **`dev` / `prod`** flows remain **Kustomize** + **`scripts/deploy-k8s.sh`**. For Docker Desktop, **Helm** is the default; use **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** with **`scripts/local-k8s-docker-desktop.sh`** if you prefer **`kubectl apply -k`**.

## Chart version

**`Chart.version`** in **`Chart.yaml`** is the chart release; **`appVersion`** tracks the app loosely. The running software version is always the **container image** you deploy.

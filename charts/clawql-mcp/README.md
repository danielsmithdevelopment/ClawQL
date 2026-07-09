# `clawql-mcp` Helm chart

Deploys **ClawQL** as **`clawql-mcp-http`**: Streamable HTTP MCP (`/mcp`), health (`/healthz`), **`/graphql`** (OpenAPI-derived introspection for debugging), and **MCP protobuf on 50051** (**`mcp-grpc-transport`** — not application gRPC backends; those use **`CLAWQL_GRPC_SOURCES`** in env). Set **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`** (and optional **`CLAWQL_GRAPHQL_SCHEMA_PATH`** / **`CLAWQL_GRAPHQL_INTROSPECTION_PATH`** / **`CLAWQL_GRAPHQL_URL`**) via **`extraEnv`** / Secrets for native protocols; bundled GraphQL-only **`linear`** uses on-image **`providers/linear/schema.graphql`** — set **`LINEAR_API_KEY`** / **`CLAWQL_LINEAR_API_KEY`** for **`execute`**. Optionally deploys a docs UI workload from the `website` image (`docs.localhost`) and a Vault-first dashboard workload from the `dashboard` image (`clawql.localhost`) with host-based Ingress.

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

Configure via **`values.yaml`** or **`--set`**. Defaults pull **`ghcr.io/danielsmithdevelopment/clawql-mcp:latest`**. **`enableMemory`**, **`enableDocuments`**, and **`enableGrpc`** default to **`true`**. Set either to **`false`** to inject **`CLAWQL_ENABLE_MEMORY=0`**, **`CLAWQL_ENABLE_DOCUMENTS=0`**, or omit **`ENABLE_GRPC`** (hide vault memory tools, the document stack + related MCP tools, or the MCP protobuf listener on **`service.grpc.port`**). **`grpcMaxMessageLength`** (default 64 MiB) sets **`GRPC_MAX_MESSAGE_LENGTH`** when gRPC is enabled — raise it for very large **`execute`** bodies over **`CallTool`**. **ClawQL Core** includes **`search`**, **`execute`**, **`audit`**, and **`cache`** — Core tools cannot be disabled via the chart ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)). **`enableNotify`** defaults to **`false`** — set **`true`** for MCP **`notify`** (Slack **`chat.postMessage`**; [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); supply **`CLAWQL_SLACK_TOKEN`** (or equivalent) via **Vault-synced** Secret refs (**`envFromSecret`** / **`envFromSecrets`**). **`enableWorkflow`** defaults to **`false`** — set **`true`** for MCP **`workflow`** (Argo Workflows ≥ 3.4.0; [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)); configure **`workflow.namespaceAllowlist`** and optional **`workflow.rbac`** Role bindings — [`docs/mcp/workflow-tool.md`](../../docs/mcp/workflow-tool.md). **`enableHitlLabelStudio`** defaults to **`false`** — set **`true`** for MCP **`hitl_enqueue_label_studio`** and **`POST /hitl/label-studio/webhook`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)); supply **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**, and **`CLAWQL_HITL_WEBHOOK_TOKEN`** via Secret refs — **`docs/mcp/hitl-label-studio.md`**. **`enableOnyx`** defaults to **`false`** — set **`true`** for MCP **`knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); set **`onyxBaseUrl`** and **`ONYX_API_TOKEN`** via Secret refs. **`enableSandbox`** defaults to **`false`** — set **`true`** to inject **`CLAWQL_ENABLE_SANDBOX=1`** for MCP **`sandbox_exec`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)); set **`CLAWQL_SANDBOX_BRIDGE_URL`** / token and/or **`CLAWQL_SANDBOX_BACKEND`** via Secret refs. **`enableOuroboros`** defaults to **`false`** — set **`true`** for MCP **`ouroboros_*`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); optional **`ouroborosDatabaseUrl`** / **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events or enable **`ouroborosPostgres.enabled=true`** to deploy Postgres alongside ClawQL in the same release ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). **`nats.enabled`** defaults to **`false`** — set **`true`** to deploy in-cluster NATS JetStream for event-driven Ouroboros/agent/edge sync workflows ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)). The full document pipeline stack (`documentPipeline.enabled`, including Paperless + in-cluster stores) is enabled by default; disable it explicitly if you want a minimal ClawQL-only footprint. **IDP collaboration** (`idpCollaboration.enabled`) optionally co-deploys **Nextcloud** and a lab **Coneshare** image (or `coneshare.externalUrl` for production compose stacks) — see [`docs/providers/idp-pipeline.md`](../../docs/providers/idp-pipeline.md).

**HashiCorp Vault is bundled (mandatory):** this chart always depends on official **`hashicorp/vault`**; disabling **`hashicorpvault.enabled`** is unsupported (render fails).
**Vault → Secret sync:** install External Secrets Operator (**[`docs/deployment/external-secrets-operator-install.md`](../../docs/deployment/external-secrets-operator-install.md)**) and apply **`docs/deployment/external-secrets-vault-cluster-secret-store.yaml`** + **`vault-external-secrets-kubernetes-auth.yaml`** so provider keys reconcile automatically after Vault writes.
**Vault-backed secret sourcing is enforced by default:** `secretSourcing.requireVaultBackedSecrets=true` fails render unless **`envFromSecret`** or **`envFromSecrets`** is set.
**`.env` is not the recommended path:** keep provider keys in Vault, sync to Kubernetes Secrets with External Secrets / Vault Secrets Operator, and reference the synced Secret names in Helm values.

**Kyverno (default on):** the chart renders a **`ClusterPolicy`** (**`verifyImages`**) for **`ghcr.io/.../clawql-mcp*`**, **`clawql-panguard-mcp-bridge*`**, **`clawql-website*`**, **`clawql-dashboard*`**, and **`openclaw-vendor*`** (mirrored OpenClaw image) by default (**`kyverno.imageSignaturePolicy.enabled: true`** in [values](values.yaml)). Install **Kyverno** in the cluster first, or set **`kyverno.imageSignaturePolicy.enabled=false`**. **`make local-k8s-up`** installs Kyverno on Docker Desktop. See **[`docs/security/image-signature-enforcement.md`](../../docs/security/image-signature-enforcement.md)**.

**RuntimeClass / Kata (opt-in):** **`security.kata.enabled`** sets **`spec.runtimeClassName`** on the MCP **`Deployment`**; **`kyverno.runtimeClassPolicy`** can enforce Kata vs gVisor **`runtimeClassName`** per namespace list ([#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274)). Defaults **off** — requires cluster **RuntimeClass** + runtimes. See **[`docs/security/runtime-class-containment.md`](../../docs/security/runtime-class-containment.md)**.

**Istio egress allowlist (opt-in, #275):** **`istio.egressAllowlist.enabled: true`** renders **ServiceEntry** resources for common SaaS provider HTTPS endpoints into the release namespace. Set **`istio.egressAllowlist.throughEgressGateway: false`** for **ServiceEntry**-only (good with **`REGISTRY_ONLY`** / ambient). Default **`throughEgressGateway: true`** also emits **Gateway** + **VirtualService** objects in **`istio.egressAllowlist.egressGatewayNamespace`** — install **`istio/gateway`** as **`istio-egressgateway`** (selector **`istio: egressgateway`**) first; see **`docker/istio/docker-desktop/istio-clawql-egress-gateway-values-*.yaml`**. Deep dive: **[`docs/deployment/helm.md`](../../docs/deployment/helm.md)**.

**Backing stores:** **DragonflyDB** only for in-cluster Celery brokers (**Paperless** **`PAPERLESS_REDIS`**, **Onyx** **`REDIS_*`**). URLs stay **`redis://…`** (**RESP** — Celery/Kombu naming is fine); the chart does **not** ship a **Redis OSS** server image. **Dragonfly** is **Apache 2.0**, targets **full protocol compatibility** for these broker call paths, and is **more performant** than Redis OSS for typical queue workloads. Tune **`stores.dragonfly`** / **`onyx.dragonfly`** in **`values.yaml`**. Rationale: [**ADR 0003**](../../docs/adr/0003-tempo-dragonfly-local-operations.md).

**Docker Desktop / Rancher Desktop:** from the repo root, **`make local-k8s-up`** uses **`values-docker-desktop.yaml`** (**Ingress** MCP at **`http://clawql-mcp.localhost/mcp`** — prod parity; **LoadBalancer** Service for **gRPC** / diagnostics; **Obsidian** memory **`vault.hostPath`** enabled by the install script (`$HOME/.ClawQL` by default — not HC Vault naming [#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161)); same bundled **HashiCorp Vault** (**standalone + PVC** — KV survives pod restarts; run **`make bootstrap-vault-eso`** so Vault init/unseal + ESO wiring apply) and **`secretSourcing.requireVaultBackedSecrets: true`** as production (lighter **`hashicorpvault.server.resources`**); **`envFromSecret: clawql-provider-env`** — wire ESO/Vault before or use a bootstrap **`Secret`**; docs UI at **`http://docs.localhost`** and dashboard at **`http://clawql.localhost`** from Helm-managed services; signed **`ghcr.io/.../clawql-mcp`**, **`ghcr.io/.../clawql-website`**, and **`ghcr.io/.../clawql-dashboard`**, with **Kyverno** + **`verifyImages`** enforcement in the release namespace). **`sandboxDocker`** is enabled there so **`sandbox_exec`** uses the **host Docker** socket (MCP container runs as **root** for socket access — local dev only). Optional **OpenClaw** gateway: **`openclaw.enabled`** / **`CLAWQL_ENABLE_OPENCLAW=1`** — default image **`ghcr.io/danielsmithdevelopment/openclaw-vendor:slim`** (**[`.github/workflows/container-mirror.yml`](../../.github/workflows/container-mirror.yml)**); see **`docs/deployment/helm.md`** and **[OpenClaw on Kubernetes](https://docs.openclaw.ai/install/kubernetes)**.
The script installs **Kyverno** and upgrades **ingress-nginx** unless disabled.
**Kustomize:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** uses **`docker/kustomize/overlays/local`** (no Helm).

**Dashboard Agent Chat → OpenClaw (in-cluster):** set **`dashboard.openclawChatUrl`** so the dashboard pod injects **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`**. Full Rancher-ready overlay (**ingress + placeholders + commented `envFromSecret`**): **[`values-rancher.example.yaml`](values-rancher.example.yaml)** — install with **`-f charts/clawql-mcp/values-rancher.example.yaml`**.

Minimal inline example:

```yaml
dashboard:
  enabled: true
  openclawChatUrl: http://openclaw:8787/v1/chat
```

Use the **Service DNS** that matches your namespace (e.g. **`http://openclaw.<ns>.svc.cluster.local:8787/v1/chat`**).

## Prometheus: scrape `GET /metrics`

ClawQL exposes **OpenMetrics** on **`GET /metrics`** (native GraphQL/gRPC counters/gauges; see **`docs/readme/deployment.md`**).

- **Istio sample Prometheus** (`istio-system`, from **`samples/addons/prometheus.yaml`**): discovers annotated **Services** via the **`kubernetes-service-endpoints`** scrape job. This chart defaults **`metrics.prometheusScrapeAnnotations.enabled: true`**, which sets **`prometheus.io/scrape`**, **`prometheus.io/path`**, and **`prometheus.io/port`** on **`svc/<fullname>`** (port defaults to **`service.http.targetPort`** — the HTTP container listen port). After **`helm upgrade`**, Istio’s Prometheus should list a **`clawql`** target without editing its ConfigMap. Set **`metrics.prometheusScrapeAnnotations.enabled: false`** to disable. If **`CLAWQL_ENABLE_HTTP_METRICS=0`**, `/metrics` is omitted — turn off scrape annotations or fix env before relying on this path.
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

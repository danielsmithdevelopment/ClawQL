# Helm chart (`charts/clawql-mcp`)

The repository ships a **Helm 3** chart that deploys the same workload as Kustomize (**`clawql-mcp-http`**): Streamable HTTP MCP (and optional gRPC) behind a Kubernetes **Service**. The chart can also deploy a UI workload and expose it through a host-based Ingress.

**Optional Falco alerting:** a separate chart **[`charts/clawql-falco`](../../charts/clawql-falco)** ships **`PrometheusRule`** resources (**`ClawQLFalco*`** names) for upstream **`falcosecurity/falco`** metrics; install Falco first, then the rules chart — see **[`charts/clawql-falco/README.md`](../../charts/clawql-falco/README.md)** ([#209](https://github.com/danielsmithdevelopment/ClawQL/issues/209)).

Use this when you prefer **`helm install` / `helm upgrade`** over **`kubectl apply -k`** (see also [`deploy-k8s.md`](deploy-k8s.md) for Kustomize).

**Feature tiers** (Core vs default-on opt-out vs opt-in): **[`docs/readme/configuration.md` § Feature tiers](../readme/configuration.md#feature-tiers-architecture-diagram)**. **ClawQL Core** (`search`, `execute`, `audit`, `cache`) has **no** chart toggles. Keys **`enableMemory`** and **`enableDocuments`** inject **`CLAWQL_ENABLE_MEMORY=0`** or **`CLAWQL_ENABLE_DOCUMENTS=0`** when **`false`**. **`enableSandbox`** (default **`false`**) injects **`CLAWQL_ENABLE_SANDBOX=1`** when **`true`** (MCP **`sandbox_exec`**); configure bridge URL + token and/or **`CLAWQL_SANDBOX_BACKEND`** via **`extraEnv`** / Secret.

## Obsidian memory storage vs HashiCorp Vault (`vault` values)

The chart key **`vault`** (and **`vault.hostPath`**) mounts **Obsidian** Markdown for **`memory_ingest`** / **`memory_recall`** at **`obsidianVaultPath`** (default **`/vault`**). It is **not** [HashiCorp Vault](https://www.vaultproject.io/) and does not install a secrets manager.

## HashiCorp Vault is bundled (mandatory dependency)

`charts/clawql-mcp/Chart.yaml` always includes the official **`hashicorp/vault`** chart (alias **`hashicorpvault`**). There is **no** Helm dependency **`condition`** to skip it under defense-in-depth. Setting **`hashicorpvault.enabled: false`** in values is **unsupported** — render fails (**`templates/zzz-defense-in-depth-secrets-policies.yaml`**).

For **cluster secrets** (tokens for Slack, Onyx, GitHub, cloud APIs, and so on), use the same paths ClawQL already supports: Kubernetes **`Secret`** objects referenced from **`envFromSecret`** or **`extraEnv`**, optionally populated by **External Secrets Operator**, **Vault Agent Injector**, **Secrets Store CSI**, or GitOps-sealed patterns. A future chart **major** version may rename **`vault`** to avoid operator confusion — tracked in [#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161).

### Recommended pattern: HashiCorp Vault -> Kubernetes Secret -> Deployment env

For production, use **HashiCorp Vault** as source-of-truth and sync selected keys into namespaced Kubernetes Secrets. Then reference those Secrets from this chart with **`envFromSecret`** / **`envFromSecrets`**.

### Recommended auth method

Use **Vault Kubernetes auth** (ServiceAccount JWT) for in-cluster secret sync controllers. It is the best default for this stack because it avoids long-lived static credentials in-cluster and ties Vault access to Kubernetes workload identity.

Prefer this order:

1. **Kubernetes auth** (recommended) — External Secrets / Vault Secrets Operator in-cluster
2. **AppRole** — acceptable for non-Kubernetes clients or bootstrap edge cases
3. **Static token** — avoid for normal operations; reserve for temporary break-glass only

Hardening notes from the defense-in-depth baseline:

- Bind Vault policies to a dedicated sync-controller ServiceAccount with least privilege (`read` only on required KV paths).
- Keep short TTL / frequent renewal for Vault-issued credentials and define revocation runbooks.
- When Istio is enabled, apply `AuthorizationPolicy` so only expected ServiceAccounts can reach the Vault Service.

Typical flow:

1. Store provider keys in Vault KV (for example `secret/data/clawql/providers`).
2. Use a sync controller (External Secrets Operator or Vault Secrets Operator) to materialize a Kubernetes Secret in the release namespace.
3. Point Helm values at that Secret:
   - `envFromSecret: clawql-provider-env`, or
   - `envFromSecrets: ["clawql-provider-env", "clawql-onyx-env"]`

This keeps provider API keys out of `.env` files and avoids ad hoc "script -> kubectl create secret" drift.

### `.env` posture (explicit)

Do **not** manage production provider secrets via repo-local `.env` files plus one-off scripts. This chart defaults to **Vault-backed secret sourcing** via:

- bundled HashiCorp Vault dependency (`hashicorpvault.*`)
- `envFromSecret` / `envFromSecrets` references to synced Kubernetes Secrets
- `secretSourcing.requireVaultBackedSecrets: true` (default), which fails render when no Secret refs are set

Current UX: the bundled ClawQL dashboard (`dashboard.*` values) can read/write Vault keys from a form UI and trigger a rollout restart of `clawql-mcp-http` so updated secrets are picked up consistently.

## Prerequisites

- Kubernetes 1.24+ (typical for `networking.k8s.io/v1` Ingress)
- [Helm 3](https://helm.sh/)
- **External Secrets Operator** (recommended for Vault → **`Secret`** sync): **[`external-secrets-operator-install.md`](external-secrets-operator-install.md)** (`external-secrets` chart **2.4.1** pinned there).
- **[Kyverno](https://kyverno.io/)** installed in the cluster (CRDs + controller) if you use the chart default **`kyverno.imageSignaturePolicy.enabled: true`** — otherwise **`helm install`** applies a **`ClusterPolicy`** the API server cannot store until Kyverno is present. Clusters without Kyverno: **`--set kyverno.imageSignaturePolicy.enabled=false`**. Context: **[`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)** and **[`docs/security/image-signature-enforcement.md`](../security/image-signature-enforcement.md)**.
- An image your cluster can pull (default: **`ghcr.io/danielsmithdevelopment/clawql-mcp`**, multi-arch **amd64** / **arm64** when published from CI)

Private GHCR: create a pull secret and set **`imagePullSecrets`** (see [values](../charts/clawql-mcp/values.yaml)).

### Kyverno image signatures (default on)

The chart **renders a `ClusterPolicy`** (**`verifyImages`**, Cosign keyless) for default **`ghcr.io/.../clawql-mcp*`**, **`clawql-panguard-mcp-bridge*`**, **`clawql-website*`**, and **`clawql-dashboard*`** when **`kyverno.imageSignaturePolicy.enabled`** is **`true`** (the **default** in [`values.yaml`](../charts/clawql-mcp/values.yaml)). Install **Kyverno** before upgrading ClawQL, or opt out:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set kyverno.imageSignaturePolicy.enabled=false
```

Forks and custom registries: override **`kyverno.imageSignaturePolicy.imageReferences`** and **`kyverno.imageSignaturePolicy.cosign`** regexes in values or an overlay. **`make local-k8s-up`** installs Kyverno for Docker Desktop. **CI → admission story:** **[`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)**; policy fields and caveats: **[`docs/security/image-signature-enforcement.md`](../security/image-signature-enforcement.md)**.

### Kyverno RuntimeClass + MCP pod Kata (opt-in, issue [#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274))

For **VM-level containment** of MCP / sandbox namespaces, use:

- **`security.kata.*`** — sets **`spec.runtimeClassName`** on the chart’s MCP **`Deployment`** when enabled.
- **`kyverno.runtimeClassPolicy.*`** — optional **`ClusterPolicy`** that requires a specific **`runtimeClassName`** per namespace list (separate **Kata** vs **gVisor** tiers).

Both default **off**. Enabling them without installing matching [**`RuntimeClass`**](https://kubernetes.io/docs/concepts/containers/runtime-class/) objects (and Kata/gVisor runtimes on nodes) will **break scheduling or admission**. Tradeoffs, namespace layout, and examples: **[`docs/security/runtime-class-containment.md`](../security/runtime-class-containment.md)**.

### Istio egress gateway + ServiceEntry allowlist ([#275](https://github.com/danielsmithdevelopment/ClawQL/issues/275))

When Istio is on the cluster ([#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)), you can force **HTTPS provider** traffic through **`istio-egressgateway`** and lock destinations with **`ServiceEntry`** resources aligned to the APIs you enable (GraphQL/OpenAPI/Discovery hosts — same idea as **`.env.example`** / bundled vendors).

**Helm chart (`charts/clawql-mcp`):**

- **`istio.egressAllowlist.enabled: true`** — renders the same allowlist **ServiceEntry** objects into the **release namespace**.
- **`istio.egressAllowlist.throughEgressGateway: true`** (default when enabled) — also renders **Gateway** + **VirtualService** objects (TLS passthrough) in **`istio.egressAllowlist.egressGatewayNamespace`** (default **`istio-system`**). Install **`istio/gateway`** as **`istio-egressgateway`** with selector **`istio: egressgateway`** first (see **`docker/istio/docker-desktop/istio-clawql-egress-gateway-values-*.yaml`**).
- **`istio.egressAllowlist.throughEgressGateway: false`** — **ServiceEntry** only (good **REGISTRY_ONLY** baseline with **ambient** mesh when you are not routing via a gateway).

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set istio.egressAllowlist.enabled=true \
 --set istio.egressAllowlist.throughEgressGateway=true
```

**Raw manifests (`docker/istio/docker-desktop/`):**

- **`clawql-mcp-egress-allowlist.yaml`** — **ServiceEntry** + **Gateway** + **VirtualService** chain (TLS passthrough).
- **`clawql-mcp-egress-serviceentries-only.yaml`** — **ServiceEntry** only (pair with **`meshConfig.outboundTrafficPolicy.mode=REGISTRY_ONLY`**).
- **`istio-clawql-egress-gateway-values-sidecar.yaml`** / **`istio-clawql-egress-gateway-values-ambient.yaml`** — **`istio/gateway`** values for **`istio-egressgateway`** by dataplane mode.

**Local install:** **`CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST=1`** with **`scripts/kubernetes/install-istio-docker-desktop.sh`** installs **`istio-egressgateway`** using values that match **`CLAWQL_LOCAL_K8S_ISTIO_MODE`** (**sidecar** or **ambient**) and applies **`clawql-mcp-egress-allowlist.yaml`**. Use **`CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE=serviceentries`** to apply **`clawql-mcp-egress-serviceentries-only.yaml`** instead (no egress gateway Helm release).

**Optional hardening:** configure **istiod** with **`meshConfig.outboundTrafficPolicy.mode=REGISTRY_ONLY`** so workloads cannot reach arbitrary external hosts—only those registered via **ServiceEntry** (then gaps fail closed instead of open).

**Quarterly STRIDE + ServiceEntry review** (control narrative: **[`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md)**):

- Diff **ServiceEntry** / **Gateway** `hosts` against the **merged provider set** you run (Helm **`provider`** / **`CLAWQL_BUNDLED_PROVIDERS`** / GraphQL sources).
- Remove unused FQDNs; add entries **before** enabling a new integration in production.
- Reconcile with **Kiali** / mesh telemetry for unexpected egress.
- Record the review with your STRIDE artifact (same cadence as the defense-in-depth doc).

**Mesh operator guide:** **[`docs/deployment/docker-desktop-istio-observability.md`](docker-desktop-istio-observability.md)** (Istio install context); **`docker/README.md`** lists **`CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST`** and **`CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE`**.

## Install from a repo clone

From the **repository root**:

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
 --namespace clawql \
 --create-namespace \
 --set envFromSecret=clawql-provider-env \
 --wait
```

Defaults use **`fullnameOverride: clawql-mcp-http`** so resource names match the Kustomize docs (**`kubectl -n clawql get deploy clawql-mcp-http`**).

**Default posture:** **`secretSourcing.requireVaultBackedSecrets`** is **`true`** in **`values.yaml`**. Setting it to **`false`** is **unsupported** (render fails). Helm must receive **`envFromSecret`** / **`envFromSecrets`** referencing _existing_ Kubernetes Secrets (normally synced from Vault — see **`external-secrets-operator-install.md`**). Create or sync **`clawql-provider-env`** **before** the first **`helm upgrade`**, or apply a minimal placeholder **`Secret`** with the expected name so the Deployment can schedule while ESO/Vault wiring finishes.

### Examples

**ClusterIP** (in-cluster only, no cloud LoadBalancer cost):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set service.type=ClusterIP \
 --set service.http.port=8080 \
 --set envFromSecret=clawql-provider-env
```

**Enable gRPC** (port **50051** on the Service; HTTP unchanged):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set enableGrpc=true \
 --set envFromSecret=clawql-provider-env
```

**Image tag** (pin a digest or release tag):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set image.tag=sha-abc1234 \
 --set envFromSecret=clawql-provider-env
```

**Tokens via existing Secret** (keys become env vars in the pod):

```bash
kubectl -n clawql create secret generic clawql-provider-env --from-literal=CLAWQL_GITHUB_TOKEN='set-from-vault-sync'
helm upgrade --install clawql ./charts/clawql-mcp -n clawql \
 --set envFromSecret=clawql-provider-env
```

**HashiCorp Vault-backed tokens via ExternalSecret** (recommended): install **[External Secrets Operator](external-secrets-operator-install.md)** and apply manifests:

```bash
kubectl apply -f docs/deployment/external-secrets-vault-cluster-secret-store.yaml
kubectl apply -f docs/deployment/vault-external-secrets-kubernetes-auth.yaml
```

Verify sync, then upgrade ClawQL:

```bash
kubectl -n clawql get externalsecret clawql-provider-env
kubectl -n clawql get secret clawql-provider-env
kubectl rollout restart deployment/clawql-mcp-http -n clawql || true

helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
 --set envFromSecret=clawql-provider-env \
 --wait
```

Full Kubernetes-auth manifests live in-repo as **`external-secrets-vault-cluster-secret-store.yaml`** + **`vault-external-secrets-kubernetes-auth.yaml`** (wired to **`ClusterSecretStore clawql-vault-kv`**).

Istio `AuthorizationPolicy` example (allow Vault access only from secret-sync + ClawQL service accounts):

```bash
kubectl apply -f docs/deployment/vault-istio-authorizationpolicy.yaml
```

Adjust principal names in that manifest to match your ServiceAccount names and namespace. If your ClawQL deployment runs as the namespace default ServiceAccount, replace `.../sa/clawql-mcp-http` with `.../sa/default`.

Ambient + waypoint-oriented variant (`targetRefs` on Vault Service):

```bash
kubectl apply -f docs/deployment/vault-istio-authorizationpolicy-ambient-waypoint.yaml
```

Use this variant when running ambient policy attachment patterns and prefer binding policy to the Vault `Service` object instead of workload labels.

### Verify policy enforcement

Confirm policy objects exist:

```bash
kubectl -n clawql get authorizationpolicy | rg vault
kubectl -n clawql describe authorizationpolicy vault-allow-clawql-and-secret-sync
```

Confirm only approved principals are listed:

```bash
kubectl -n clawql get authorizationpolicy vault-allow-clawql-and-secret-sync -o yaml | rg "principals|external-secrets|clawql-mcp-http"
```

If using ambient `targetRefs`, verify service attachment:

```bash
kubectl -n clawql get authorizationpolicy vault-allow-clawql-and-secret-sync-ambient -o yaml | rg "targetRefs|clawql-hashicorpvault"
```

Mesh-level sanity check (if `istioctl` is available):

```bash
istioctl x describe pod -n clawql deploy/clawql-mcp-http
```

Expected outcome:

- `cluster.local/ns/external-secrets/sa/external-secrets` (ESO) and optionally `cluster.local/ns/clawql/sa/clawql-mcp-http` can reach Vault — adjust principals to match your mesh identity strings.
- Other service accounts in the namespace receive denied traffic to Vault (HTTP 403 / RBAC deny in mesh logs).

One-shot check (after policies are applied):

```bash
make verify-vault-policy
```

Optional: `CLAWQL_VAULT_POLICY_NS=my-ns make verify-vault-policy`

**Optional OpenClaw gateway** (containerized [`openclaw`](https://docs.openclaw.ai/install/kubernetes) workload — not the npm CLI): set **`openclaw.enabled=true`**, provide **`openclaw.gatewayToken`** (unless **`openclaw.existingSecret`** names a Secret that already has **`OPENCLAW_GATEWAY_TOKEN`**), and optionally provider keys under **`openclaw.*ApiKey`**. Default image is **`ghcr.io/danielsmithdevelopment/openclaw-vendor:slim`** (daily mirror + Trivy gate + Cosign in **[`.github/workflows/container-mirror.yml`](../../.github/workflows/container-mirror.yml)**); use **`openclaw.image.repository=ghcr.io/openclaw/openclaw`** if you prefer upstream before the mirror exists. Loopback bind in-pod, **`ClusterIP`** Service on **18789**. Access with **`kubectl port-forward svc/<fullname>-openclaw 18789:18789`** (see post-install **`NOTES`**).

When **`openclaw.clawqlMcp.enabled`** is **`true`** (default), the chart renders **`mcp.servers.clawql`** in **`openclaw.json`** pointing at in-cluster Streamable HTTP MCP (`http://<mcp-service>.<ns>.svc.cluster.local:<port>/mcp`; uses **`mcpProxy`** Service when **`mcpProxy.enabled`**). Override with **`openclaw.clawqlMcp.url`**. For JWT-gated MCP, set **`openclaw.clawqlMcp.bearerToken`** or **`openclaw.clawqlMcp.bearerTokenSecret`** (injected as **`CLAWQL_MCP_BEARER_TOKEN`** for OpenClaw header interpolation).

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set openclaw.enabled=true \
  --set-string openclaw.gatewayToken="$(openssl rand -hex 24)"
```

Docker Desktop **`make local-k8s-up`** opt-in: **`CLAWQL_ENABLE_OPENCLAW=1`** and **`OPENCLAW_GATEWAY_TOKEN=...`** (see **`scripts/kubernetes/local-k8s-docker-desktop.sh`**).

**Dashboard Agent Chat → OpenClaw:** when **`openclaw.chatBridge.enabled`** (default **`true`**) and **`dashboard.openclawChatUrl`** is empty, the chart injects **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`** pointing at the in-pod chat-bridge sidecar (`POST /v1/chat` on port **8787**). The bridge runs **`openclaw agent`** per request ([`dashboard/scripts/openclaw-chat-bridge.mjs`](../../dashboard/scripts/openclaw-chat-bridge.mjs); chart copy under **`charts/clawql-mcp/files/`**). Disable with **`openclaw.chatBridge.enabled=false`** or override **`dashboard.openclawChatUrl`**.

**Dashboard chat history on the Obsidian vault:** when **`dashboard.enabled=true`**, the Deployment sets **`CLAWQL_OBSIDIAN_VAULT_PATH`** (same as MCP **`obsidianVaultPath`**, default **`/vault`**) and mounts the **obsidian-vault** volume (PVC, **`vault.hostPath`**, or **`emptyDir`** — same precedence as the MCP pod). Agent Chat threads persist under **`Dashboard/chats/`** (`index.json`, per-thread **`meta.json`**, **`messages.jsonl`**, **`activity.jsonl`**); API logs append to **`Dashboard/logs/agent-chat.jsonl`**. Local dev default without env: **`~/.ClawQL`**. See **[`dashboard/README.md`](../../dashboard/README.md)** and **[memory-obsidian.md](../memory/memory-obsidian.md)** § Dashboard data.

**Optional Goose agent pool** ([`block/goose`](https://github.com/block/goose)): **`goose.enabled=true`**, set **`goose.replicaCount`** (start at **0**, scale on demand), provider keys via **`goose.*ApiKey`** or **`goose.existingSecret`**. Injects **`CLAWQL_MCP_URL`** when **`goose.clawqlMcp.enabled`**. Stateful PVC at **`goose.persistence.mountPath`** (default **`/opt/clawql/goose`**). Idle **`sleep infinity`** until AgentRuntime task API ships.

**Hermes (NL ops):** **`hermes.enabled=true`** sets **`CLAWQL_DASHBOARD_HERMES_OPS=1`** on the dashboard Deployment (reserved for **`@hermes`** routing — see deployment ops guide). No separate container.

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set openclaw.enabled=true \
  --set dashboard.enabled=true \
  --set-string openclaw.gatewayToken="$(openssl rand -hex 24)"
```

**Persistent Obsidian memory** (`memory_ingest` / `memory_recall` survive pod restarts; PVC at **`/vault`**, not secrets manager):

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
 --set stores.dragonfly.enabled=false
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

### Subject naming (deck-aligned)

Issue [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127) tracks Helm + docs for this convention.

Helm deploys **only** the NATS server. **JetStream streams and consumers** are created by workers (Ouroboros, agents, edge jobs), not by chart templates — standardize **subject roots** early:

| Root                | Use                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `clawql.workflow.>` | Ouroboros phases, workflow checkpoints, structured loops ([#110](https://github.com/danielsmithdevelopment/ClawQL/issues/110)) |
| `clawql.agent.>`    | Agent coordination, LangGraph-related handoff ([ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent))         |
| `clawql.document.>` | Document pipeline hops (Tika → Gotenberg → Stirling → Paperless), provenance                                                   |
| `clawql.edge.>`     | Edge worker join/leave/status ([#129](https://github.com/danielsmithdevelopment/ClawQL/issues/129))                            |

Defaults live in chart **`values.yaml`** as **`nats.subjectConvention`** (`workflow` / `agent` / `document` / `edge` keys) for operators and downstream charts.

**Related in-repo tracks:** Cuckoo/Merkle and audit publications ([#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114), [#115](https://github.com/danielsmithdevelopment/ClawQL/issues/115), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)); full-stack service map ([#113](https://github.com/danielsmithdevelopment/ClawQL/issues/113)).

**Retention / consumers:** choose per stream — for example **limits** retention with **`max_age`** for workflow telemetry vs **interest** for task queues. Set **ACK** policies explicitly on pull consumers so replay behavior matches compliance expectations. Configure streams in application init or GitOps — not in the NATS `ConfigMap` here.

**Prometheus / Grafana:** the broker monitor port exposes **JSON** (`/healthz`, `/jsz`, `/varz`), not OpenMetrics. Use **[NATS Prometheus exporter](https://github.com/nats-io/prometheus-nats-exporter)** sidecar or HTTP probes for uptime; wire dashboards separately from ClawQL’s **`GET /metrics`** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

**Out of scope for v1:** multi-cluster NATS federation (deck “FUTURE”) — track when single-cluster JetStream is stable.

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
curl -s http://127.0.0.1:8222/jsz | head -c 800
kubectl -n clawql get deploy clawql-mcp-http -o yaml | rg "CLAWQL_NATS_URL|CLAWQL_NATS_JETSTREAM" -n
```

**Ingress** (optional): set **`ingress.enabled=true`** and edit **`ingress.hosts`** / **`ingress.tls`** in a small values file; backend targets the HTTP **`service.http.port`**.

**Docs UI + Ingress** (optional): set **`ui.enabled=true`** and **`ui.ingress.enabled=true`** to deploy the docs UI (`website`) Deployment/Service and route a host (default: **`docs.localhost`**) to it.

**Dashboard + Ingress** (optional): set **`dashboard.enabled=true`** and **`dashboard.ingress.enabled=true`** to deploy the Vault-first dashboard Deployment/Service and route a host (default: **`clawql.localhost`**) to it.

### Bundled dashboard quick config

Minimal enablement (generic cluster):

```yaml
dashboard:
  enabled: true
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: clawql.localhost
        paths:
          - path: /
            pathType: Prefix
```

Common tuning knobs:

```yaml
dashboard:
  image:
    repository: ghcr.io/danielsmithdevelopment/clawql-dashboard
    tag: latest
    pullPolicy: IfNotPresent
  allowSync: true
  k8s:
    namespace: clawql
    secretName: clawql-provider-env
    deploymentName: clawql-mcp-http
  vault:
    namespace: clawql
    pod: clawql-vault-0
    addr: http://127.0.0.1:8200
    mount: secret
    path: provider/env
```

Operational notes:

- `dashboard.vault.*` should target your Vault pod/mount/path for the environment data model used by ClawQL.
- `dashboard.k8s.deploymentName` is the rollout target after Vault updates (defaults to `clawql-mcp-http`).
- For Docker Desktop, these are already preconfigured in `values-docker-desktop.yaml` with host `clawql.localhost`.

### Rancher / in-cluster OpenClaw (Agent Chat)

For **SUSE Rancher**, **RKE2**, or other Helm-driven clusters, use the checked-in overlay **[`values-rancher.example.yaml`](../../charts/clawql-mcp/values-rancher.example.yaml)**: **`dashboard.enabled`**, **`dashboard.openclawChatUrl`**, **`dashboard.ingress`** (editable host + TLS stubs), **`imagePullSecrets`** notes, and a commented **`envFromSecret`** line for **`secretSourcing.requireVaultBackedSecrets`**.

Install:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace --wait \
  -f charts/clawql-mcp/values-rancher.example.yaml
```

Point **`openclawChatUrl`** at the workload that exposes **`POST /v1/chat`** (`{ reply }` JSON). See **`docs/openclaw/using-openclaw-with-clawql.md`** for OpenClaw + model/auth context.

Verify the dashboard pod received the proxy URL:

```bash
kubectl -n clawql get deploy clawql-mcp-http-dashboard -o yaml | rg "CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL" -n
```

### Dashboard incident runbook (quick checks)

Use this when `http://clawql.localhost` is failing, dashboard sync appears stuck, or Vault updates do not land in `clawql-mcp-http`.

1. Dashboard health:

```bash
curl -sS http://clawql.localhost/api/k8s/health
```

2. Dashboard workload objects:

```bash
kubectl -n clawql get deploy,svc,ingress | rg dashboard
kubectl -n clawql get pods -l app.kubernetes.io/component=dashboard
```

3. Dashboard env wiring (Vault + rollout target):

```bash
kubectl -n clawql get deploy clawql-mcp-http-dashboard -o yaml | rg "CLAWQL_DASHBOARD_(VAULT|K8S|OPENCLAW)_" -n
```

4. Rollout target health:

```bash
kubectl -n clawql get deploy clawql-mcp-http
kubectl -n clawql rollout status deploy/clawql-mcp-http --timeout=180s
```

5. Vault read-back verification:

```bash
kubectl -n clawql exec clawql-vault-0 -- sh -lc 'VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-root}" vault kv get -field=ONYX_BASE_URL secret/provider/env'
```

If checks pass but UI is stale, restart dashboard and retry one save:

```bash
kubectl -n clawql rollout restart deploy/clawql-mcp-http-dashboard
kubectl -n clawql rollout status deploy/clawql-mcp-http-dashboard --timeout=180s
```

## Production hardening (default full-stack install)

The chart now enables document pipeline + stores by default, including in-cluster Postgres for Paperless. Before production use:

- Replace the default **`stores.postgres.auth.password`** immediately.
- Prefer **`stores.postgres.auth.existingSecret`** over inline values.
- If you do not need in-cluster stores/pipeline, disable them explicitly (`documentPipeline.enabled=false`, `stores.postgres.enabled=false`, `stores.dragonfly.enabled=false`).

## Access bundled docs locally (Docker Desktop)

When you use the local Helm flow (`make local-k8s-up`), the chart deploys both the `website` docs UI and `dashboard` UI and exposes them through ingress-nginx (or Istio Gateway+VirtualService when enabled).

- Dashboard UI: **`http://clawql.localhost`**
- Docs UI: **`http://docs.localhost`**
- MCP endpoint (local Helm + **`values-docker-desktop.yaml`**): **`http://clawql-mcp.localhost/mcp`** (**Ingress**); for **Service LoadBalancer** URLs use **`kubectl get svc`**; **Compose** / **`npm run start:http`**: **`http://localhost:8080/mcp`**

Quick verify:

```bash
curl -s http://clawql.localhost/api/k8s/health
curl -s http://docs.localhost/api/health
```

Expected responses include **`{"status":"ok"}`**.

## Optional Istio and observability (Docker Desktop)

**Not part of the Helm chart:** when you set **`CLAWQL_LOCAL_K8S_ISTIO=ambient`** or **`sidecar`** for **`make local-k8s-up`**, a separate script installs **Istio**, optional **ingress gateway** manifests, and **sample addons** in **`istio-system`** (Prometheus, Kiali, Grafana), plus **Helm Grafana Tempo**, optional **Helm Loki**, and ClawQL’s **OpenTelemetry Collector** manifest. Use this for **local mesh mTLS** and a **full observability lab** on one machine.

- **Beginner-oriented guide** (what each tool is, first session, port-forwards, OTLP env for MCP): **[`docker-desktop-istio-observability.md`](docker-desktop-istio-observability.md)**
- **Env toggles and MCP URLs:** [`docker/README.md`](../../docker/README.md)
- **OTLP from `clawql-mcp-http`:** set **`extraEnv`** (see commented example in **`charts/clawql-mcp/values-docker-desktop.yaml`**) for **`CLAWQL_ENABLE_OTEL_TRACING`** and **`OTEL_EXPORTER_OTLP_ENDPOINT`**.
- **MCP `/metrics` in Istio’s Prometheus:** the chart defaults **`metrics.prometheusScrapeAnnotations.enabled: true`**, which annotates **`svc/clawql-mcp-http`** so **Istio sample addons** (job **`kubernetes-service-endpoints`**) scrape **`GET /metrics`** automatically. Set **`metrics.prometheusScrapeAnnotations.enabled: false`** to opt out. For **Prometheus Operator**, set **`metrics.serviceMonitor.enabled: true`** (requires **`monitoring.coreos.com/v1`** **ServiceMonitor** CRD) — see **[`charts/clawql-mcp/README.md`](../../charts/clawql-mcp/README.md)** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

## Values

See **[`charts/clawql-mcp/values.yaml`](../charts/clawql-mcp/values.yaml)**. Common keys:

| Key                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image.repository`, `image.tag`, `image.pullPolicy` | Container image                                                                                                                                                                                                                                                                                                                                                                                                              |
| `service.type`, `service.http.port`                 | `LoadBalancer` vs `ClusterIP`, front port                                                                                                                                                                                                                                                                                                                                                                                    |
| `provider`                                          | **`CLAWQL_PROVIDER`** (e.g. `google`, `all-providers`; default **`all-providers`**) — for custom id lists, set container env **`CLAWQL_BUNDLED_PROVIDERS`**.                                                                                                                                                                                                                                                                 |
| `enableGrpc` / `enableGrpcReflection`               | gRPC listener on **50051**                                                                                                                                                                                                                                                                                                                                                                                                   |
| `enableMemory`                                      | When **`false`**, sets **`CLAWQL_ENABLE_MEMORY=0`** (hides vault tools). Default **`true`**. See [memory-obsidian.md](../memory/memory-obsidian.md)                                                                                                                                                                                                                                                                          |
| `enableDocuments`                                   | When **`false`**, sets **`CLAWQL_ENABLE_DOCUMENTS=0`** (omits tika / gotenberg / paperless / stirling / onyx from **`all-providers`**; hides **`ingest_external_knowledge`** and **`knowledge_search_onyx`**). Default **`true`** — [mcp-tools.md](../mcp/mcp-tools.md)                                                                                                                                                      |
| `enableNotify`                                      | **`CLAWQL_ENABLE_NOTIFY=1`** — MCP **`notify`** (Slack **`chat.postMessage`**; default **false**; [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); set **`CLAWQL_SLACK_TOKEN`** via **`extraEnv`** / Secret — **[notify-tool.md](../mcp/notify-tool.md)**                                                                                                                                                 |
| `enableHitlLabelStudio`                             | **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** — MCP **`hitl_enqueue_label_studio`** + **`POST /hitl/label-studio/webhook`** (default **false**; [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)); set **`CLAWQL_LABEL_STUDIO_*`** / **`CLAWQL_HITL_WEBHOOK_TOKEN`** via **`extraEnv`** / Secret — **[hitl-label-studio.md](../mcp/hitl-label-studio.md)**                                                      |
| `enableOnyx` / `onyxBaseUrl`                        | **`CLAWQL_ENABLE_ONYX=1`** — MCP **`knowledge_search_onyx`** (default **false**; [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); **`onyxBaseUrl`** sets **`ONYX_BASE_URL`**. Supply **`ONYX_API_TOKEN`** (Bearer) via **`extraEnv`** / Secret — **[onyx-knowledge-tool.md](../mcp/onyx-knowledge-tool.md)**                                                                                            |
| `enableOuroboros` / `ouroborosDatabaseUrl`          | **`CLAWQL_ENABLE_OUROBOROS=1`** — MCP **`ouroboros_*`** (default **false**; [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)); **`ouroborosDatabaseUrl`** sets **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). Prefer Secret-backed env when the URL contains credentials — **[mcp-tools.md](../mcp/mcp-tools.md)** |
| `ouroborosPostgres.*`                               | Optional Postgres workload in the same release for durable Ouroboros events ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). When enabled, chart wires **`CLAWQL_OUROBOROS_DB_*`** env vars from Service + Secret into `clawql-mcp` (no credential-in-URL required).                                                                                                                                   |
| `documentPipeline.*`                                | Full-stack document pipeline workloads (**Tika**, **Gotenberg**, **Stirling**, **Paperless**) with in-cluster base URLs injected into ClawQL for integrated deployments. Enabled by default; disable explicitly for minimal installs ([#113](https://github.com/danielsmithdevelopment/ClawQL/issues/113)).                                                                                                                  |
| `stores.*`                                          | In-cluster backing stores for full-stack topology (**Postgres**, **Dragonfly** for Celery / queues — RESP via **`redis://`** URLs only; Redis OSS is not deployed). Enabled by default; required when `documentPipeline.paperless.enabled=true`. Tune **`stores.dragonfly.image`** / **`stores.dragonfly.args`**.                                                                                                            |
| `flink.*`                                           | Optional in-cluster Apache Flink topology for real-time Onyx connector sync ([#119](https://github.com/danielsmithdevelopment/ClawQL/issues/119)). Deploys JobManager + TaskManagers + internal Service (ClusterIP default). Use `flink.connectorSecret` to scope connector credentials to Flink pods only.                                                                                                                  |
| `nats.*`                                            | Optional in-cluster NATS JetStream deployment for durable event streaming across Ouroboros, agent orchestration, and edge worker sync ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)). Injects `CLAWQL_NATS_URL` into `clawql-mcp` when enabled (or from `nats.url` for external NATS).                                                                                                                |
| `extraEnv`                                          | Additional container env entries                                                                                                                                                                                                                                                                                                                                                                                             |
| `envFromSecret`                                     | **`envFrom`** from one existing Secret                                                                                                                                                                                                                                                                                                                                                                                       |
| `envFromSecrets`                                    | **`envFrom`** from multiple existing Secrets (ordered list; useful for Vault-synced secret sets)                                                                                                                                                                                                                                                                                                                             |
| `secretSourcing.requireVaultBackedSecrets`          | **`true`** (required). **`false`** is rejected; Helm must supply **`envFromSecret`** / **`envFromSecrets`**.                                                                                                                                                                                                                                                                                                                 |
| `hashicorpvault`                                    | Bundled **`hashicorp/vault`** subchart is **always** installed. **`enabled: false`** is **unsupported** (render fails).                                                                                                                                                                                                                                                                                                      |
| `persistence`                                       | PVC for **Obsidian memory** at **`/vault`** instead of **`emptyDir`** — not HashiCorp Vault ([#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161))                                                                                                                                                                                                                                                            |
| `vault.hostPath`                                    | Host bind for **Obsidian memory** at **`/vault`** (e.g. Docker Desktop; mutually exclusive with **`persistence`**) — same naming caveat ([#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161))                                                                                                                                                                                                                |
| `ingress`                                           | Optional HTTP(S) Ingress                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ui`                                                | Optional docs UI (`website`) Deployment/Service/Ingress (defaults for Docker Desktop use `docs.localhost`)                                                                                                                                                                                                                                                                                                                   |
| `dashboard`                                         | Optional Vault-first dashboard Deployment/Service/Ingress (`clawql-dashboard` image; defaults for Docker Desktop use `clawql.localhost`)                                                                                                                                                                                                                                                                                     |
| `dashboard.openclawChatUrl`                         | When non-empty, injects **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`** (Agent Chat → in-cluster **`POST /v1/chat`**). Rancher-focused overlay with ingress: **[`charts/clawql-mcp/values-rancher.example.yaml`](../charts/clawql-mcp/values-rancher.example.yaml)**.                                                                                                                                                               |
| `metrics.prometheusScrapeAnnotations`               | When **`enabled: true`** (default), adds **`prometheus.io/*`** on the MCP **Service** for Prometheus stacks that honor Service annotations (including **Istio** sample Prometheus). Set **`path`** / **`port`** if your HTTP listen port differs from **`service.http.targetPort`**.                                                                                                                                         |
| `metrics.serviceMonitor`                            | When **`enabled: true`**, renders a **`ServiceMonitor`** (**`monitoring.coreos.com/v1`**) scraping **`/metrics`** on **`port: http`**. Default **`false`**. Optional **`namespace`**, **`labels`**, **`interval`**, **`scrapeTimeout`**.                                                                                                                                                                                     |

**Docker Desktop:** **`make local-k8s-up`** installs **Kyverno**, **bundled HashiCorp Vault** (lighter **`hashicorpvault.server.resources`** in the overlay), and **`helm upgrade --install`** with **`values-docker-desktop.yaml`** (LoadBalancer **8080**, **`all-providers`**, **`vault.hostPath.enabled=true`** and **`vault.hostPath.path=$HOME/.ClawQL`** for **Obsidian** memory via script **`--set`** — not HC Vault naming; **`secretSourcing.requireVaultBackedSecrets: true`** + **`envFromSecret: clawql-provider-env`**; dashboard ingress **`clawql.localhost`** and docs ingress **`docs.localhost`**; signed **`ghcr.io/.../clawql-mcp`**, **`clawql-website`**, and **`clawql-dashboard`**, **`kyverno.imageSignaturePolicy`** enabled with **`matchReleaseNamespaceOnly: true`**). **ingress-nginx** installs unless **`CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=0`**. **Kustomize** for the MCP manifest: **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** — Helm is still required for Kyverno and for templating the **ClusterPolicy**. Unsigned local image build env vars are **not** supported (script exits).

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

|                    | Kustomize (`docker/kustomize/`)                 | Helm (`charts/clawql-mcp`)                                                 |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| **Naming**         | Overlays **`dev`**, **`prod`**, **`base`**      | **`values.yaml`** + **`--set`**                                            |
| **Image**          | Rewritten by **`scripts/deploy/deploy-k8s.sh`** | **`image.repository`** / **`image.tag`**                                   |
| **Docker Desktop** | Optional **`overlays/local`**                   | **Default** — **`values-docker-desktop.yaml`** via **`make local-k8s-up`** |

Remote **`dev` / `prod`** flows remain **Kustomize** + **`scripts/deploy/deploy-k8s.sh`**. For Docker Desktop, **Helm** is the default; use **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** with **`scripts/kubernetes/local-k8s-docker-desktop.sh`** if you prefer **`kubectl apply -k`**.

## Chart version

**`Chart.version`** in **`Chart.yaml`** is the chart release; **`appVersion`** tracks the app loosely. The running software version is always the **container image** you deploy.

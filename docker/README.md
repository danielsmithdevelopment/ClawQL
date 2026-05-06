# ClawQL MCP container

Slim [Distroless](https://github.com/GoogleContainerTools/distroless) image with production dependencies, compiled `dist/`, `bin/`, and bundled `providers/` for offline spec lookup.

## Prebuilt image (GHCR)

A **daily** GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds `main` and pushes to **GitHub Container Registry**:

`ghcr.io/danielsmithdevelopment/clawql-mcp`

Tags include **`latest`**, **`nightly`**, **`sha-<short>`**, and on scheduled runs **`nightly-YYYYMMDD`**. Pull (public package — set visibility under **Packages** if needed):

```bash
docker pull ghcr.io/danielsmithdevelopment/clawql-mcp:latest
```

## Supply chain (SBOM, provenance, scan, sign)

**Narrative (end to end + cluster enforcement):** **[`docs/security/golden-image-pipeline.md`](../docs/security/golden-image-pipeline.md)**.

The [Docker publish workflow](../.github/workflows/docker-publish.yml) first runs the same **repository** gates as CI (**OSV-Scanner**, **Trivy** filesystem, **Syft** CycloneDX SBOM artifact). Only after those pass, **one `docker buildx build`** writes each image to a **local OCI image layout** (`type=oci,tar=false` — no registry write) with **BuildKit SBOM + provenance attestations**; **Trivy** scans that layout (**HIGH** / **CRITICAL**, [`.trivyignore`](../.trivyignore)) and the workflow **fails before any GHCR write** if the scan fails. The **same layout** is then published with **`skopeo copy`** (**no second build**), **immutable `sha-*`** tags first, then **Cosign** keyless signing (GitHub Actions OIDC) and promotion of **`latest`** / **`nightly`** / **`nightly-YYYYMMDD`** via `docker buildx imagetools create`. Rolling tags never advance on a failed gate. (Scanner coverage is still bounded by Trivy/OSV data and configured severities; it is not a proof of zero defects.) For **npm** packages, see **[`docs/security/npm-supply-chain.md`](../docs/security/npm-supply-chain.md)**.

**Verify a signature** (install [Cosign](https://docs.sigstore.dev/cosign/installation/); use the digest from GHCR or the workflow log):

```bash
IMAGE="ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:<digest>"
cosign verify "$IMAGE" \
  --certificate-identity-regexp 'https://github\.com/danielsmithdevelopment/ClawQL/.*' \
  --certificate-oidc-issuer-regexp 'https://token\.actions\.githubusercontent\.com.*'
```

Use the same pattern for **`ghcr.io/danielsmithdevelopment/clawql-website@sha256:…`**. If you fork the repo, adjust the **`certificate-identity-regexp`** to match your GitHub org/repo.

**Cluster enforcement:** CI signing does not, by itself, stop someone from applying an unsigned image. For **admission-time** enforcement (e.g. Kyverno **`verifyImages`** + digest pins), see **[`docs/security/image-signature-enforcement.md`](../docs/security/image-signature-enforcement.md)**.

**Repository SBOM (lockfiles + sources Syft detects):** the [CI `supply-chain` job](../.github/workflows/ci.yml) uploads a **CycloneDX JSON** artifact (**`sbom-cyclonedx-repository`**) from **Syft** — download it from the workflow run’s **Artifacts** tab on GitHub Actions.

## Build

From the repository root:

```bash
docker build -f docker/Dockerfile -t clawql-mcp .
```

## Run (remote MCP over HTTP)

The default container command starts MCP Streamable HTTP on `PORT` (default `8080`) at `/mcp`.

```bash
docker run --rm -p 8080:8080 clawql-mcp
```

Health check:

```bash
curl http://localhost:8080/healthz
```

Override provider/spec [as in `.env.example`](../.env.example), for example:

```bash
docker run --rm -p 8080:8080 -e CLAWQL_PROVIDER=github clawql-mcp
```

Single-spec `execute` uses in-process OpenAPI→GraphQL. **`clawql-mcp-http`** serves **`/graphql`** on the same port as **`/mcp`**. Multi-spec presets use REST for `execute`.

**Obsidian vault:** The image sets **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** and includes a writable **`/vault`** directory for **`memory_ingest`** / **`memory_recall`** and **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)**. **`docker-compose.yml`** bind-mounts **`${CLAWQL_VAULT_HOST_PATH:-${HOME}/.ClawQL}`** → **`/vault`** so notes persist on the host (override **`CLAWQL_VAULT_HOST_PATH`** for a different folder). See the main [README](../README.md#obsidian-vault-optional).

**Sandbox (`sandbox_exec`):** Set **`CLAWQL_ENABLE_SANDBOX=1`** to register the tool. **Kubernetes (`values-docker-desktop.yaml`):** **`sandboxDocker.enabled: true`** mounts **`/var/run/docker.sock`**, installs a static **`docker`** CLI (initContainer), sets **`CLAWQL_SANDBOX_BACKEND=docker`**, and runs the MCP container as **root** for socket access (**local clusters only**). **Compose:** build target **`runtime-with-docker-cli`** mounts the host socket and sets **`CLAWQL_SANDBOX_BACKEND=docker`**. Alternatively use **`CLAWQL_SANDBOX_BRIDGE_URL`** + **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** with the [sandbox bridge](../cloudflare/sandbox-bridge/README.md) Worker.

Full MCP tool list and JSON examples: **[`docs/mcp/mcp-tools.md`](../docs/mcp/mcp-tools.md)**.

## Run (stdio, optional)

If you specifically want stdio mode in a container:

```bash
docker run -i --rm --entrypoint node clawql-mcp dist/server.js
```

## Layout

| Path                             | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `docker/Dockerfile`              | Multi-stage build → distroless runtime                            |
| `.dockerignore`                  | Keeps build context small (root; used by `docker build` from `.`) |
| `docker/docker-compose.yml`      | Local stack (`clawql-mcp-http` only)                              |
| `docker/kubernetes-starter.yaml` | Starter K8s namespace + Deployments + Services                    |

**Helm:** a maintained chart lives at **`charts/clawql-mcp`** — see **[`docs/deployment/helm.md`](../docs/deployment/helm.md)**. Kustomize overlays remain under **`docker/kustomize/`**.

## Docker Compose (local)

**Conflict with Kubernetes:** If you use **`make local-k8s-up`** (ClawQL in the **`clawql`** namespace), **do not** run Compose on the same machine. Compose binds **`localhost:8080`** (MCP); Kubernetes local Helm exposes MCP on **Ingress** **`http://clawql-mcp.localhost/mcp`** (prod parity — same pattern as **`https://mcp.example.com/mcp`**). **`localhost:4000`** may still conflict for GraphQL. Stop Compose first: `docker compose -f docker/docker-compose.yml down`. Prefer **one** local runtime: either Compose **or** K8s (recommended when Langfuse or other workloads already run in-cluster).

Run both services together (containers use **`restart: unless-stopped`** so they come back after Docker Desktop or host reboot):

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Or from the repo root:

```bash
make local-docker-up
```

Endpoints:

- MCP HTTP (`make local-k8s-up`, default **Istio**): **`http://localhost/mcp`** and **`http://clawql-mcp.localhost/mcp`** (same **VirtualService** bindings; **`svc/clawql-mcp-ingress`** is **LoadBalancer → localhost** on **Docker Desktop / Rancher Desktop**, because **pod `hostNetwork`** binds inside the Kubernetes VM and does **not** listen on macOS/Windows **127.0.0.1** — no kubectl port-forward). On bare-metal / Linux nodes you can force **`CLAWQL_ISTIO_GATEWAY_HOST_NETWORK=1`**. Fallback when **`CLAWQL_LOCAL_K8S_ISTIO=0`** or forced **ingress-nginx**: **`http://clawql-mcp.localhost/mcp`**
- MCP health: **`curl -s http://localhost/healthz`** (default Istio gateway) or **`curl -s http://clawql-mcp.localhost/healthz`**
- GraphQL proxy: `http://localhost:4000/graphql`

**Cursor MCP:** use Streamable HTTP. For **`make local-k8s-up`** with default Istio, prefer **`http://localhost/mcp`** or **`http://clawql-mcp.localhost/mcp`** (see **`.cursor/mcp.json.example`**). For **docker-compose**, use **`http://localhost:8080/mcp`**. For diagnostics when **`svc/clawql-mcp-http`** is **LoadBalancer**, set **`CLAWQL_MCP_URL`** from **`kubectl -n clawql get svc clawql-mcp-http`**. See [Cursor docs](https://cursor.com/docs/context/mcp).

## Kubernetes on Docker Desktop (Helm default, Kustomize optional)

1. Enable **Kubernetes** in Docker Desktop (Settings → Kubernetes → Enable cluster).
2. Install **[Helm 3](https://helm.sh/docs/intro/install/)** on your PATH (**required** for every `local-k8s-up` path — the script installs **Kyverno** via Helm).
3. From the repo root, **`make local-k8s-up`** installs **Kyverno** (namespace **`kyverno`**) and applies a **ClusterPolicy** that **enforces Cosign (keyless)** signatures for **`ghcr.io/danielsmithdevelopment/clawql-mcp*`** and **`clawql-website*`** in the **`clawql`** release namespace only. With **Istio** (default ambient), **`ingress-nginx` is omitted automatically** and **`istio-ingress`** **`deployment/clawql-mcp-ingress`** is exposed on **localhost :80 / :50051** via **`Service/clawql-mcp-ingress` `type: LoadBalancer`** on **docker-desktop** / **rancher-desktop** kube contexts (automatic — **`hostNetwork`** would bind inside the VM only). On other clusters the script defaults **`hostNetwork`** + **ClusterIP** unless you set **`CLAWQL_ISTIO_GATEWAY_HOST_NETWORK=0`**. **Gateway + VirtualServices** terminate **`localhost`**, **`clawql-mcp.localhost`**, **`clawql.localhost`**, **`onyx.localhost`**, … without per-user **`kubectl`** steps. Helm still deploys MCP + UI workloads; **`CLAWQL_LOCAL_K8S_ISTIO=0`** switches back to **ingress-nginx** + rendered **Ingress**. It runs **`helm upgrade --install`** with **`charts/clawql-mcp/values-docker-desktop.yaml`**: **`svc/clawql-mcp-http`** is **ClusterIP by default when Istio is on**, signed **`ghcr.io/.../clawql-mcp:latest`** and **`ghcr.io/.../clawql-website:latest`** (`pullPolicy: Always`), **`all-providers`**, and a vault backend:
   - default **hostPath** at **`$HOME/.ClawQL`** (override **`CLAWQL_LOCAL_VAULT_HOST_PATH`**),
   - or in-cluster **PVC** with **`CLAWQL_LOCAL_K8S_VAULT_BACKEND=pvc make local-k8s-up`**.
   The cluster must reach **Rekor** / Sigstore for verification.

```bash
make local-k8s-up
# or: bash scripts/kubernetes/local-k8s-docker-desktop.sh
```

If Helm errors with **invalid ownership** (MCP was previously installed with **`kubectl apply`** / Kustomize), remove the old workload and reinstall: **`make local-k8s-mcp-delete && make local-k8s-up`**.

**Kustomize instead of Helm for ClawQL manifests:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize make local-k8s-up`** still uses **Helm** for **Kyverno**, then **`kubectl apply -k docker/kustomize/overlays/local`** and applies the same **ClusterPolicy** via **`helm template … --show-only`**.

**Unsigned local images are not supported** on this path: **`CLAWQL_LOCAL_K8S_BUILD_IMAGE=1`** and **`CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE=1`** are rejected (Kyverno would block unsigned **`clawql-mcp`** / **`clawql-website`**). For local iteration from source without cluster admission, use **`make local-docker-up`** (Compose) or push a branch build to GHCR and point **`image.tag`** at that digest or tag.

### Istio + observability stack (local desktop k8s — default on)

**Long-form beginner guide (each tool explained):** **[`docs/deployment/docker-desktop-istio-observability.md`](../docs/deployment/docker-desktop-istio-observability.md)**. This README keeps install commands, env toggles, and port-forward shortcuts.

**`make local-k8s-up`** runs Istio and the **heavy** observability bundle **by default** (Prometheus, Kiali, Grafana, Tempo, Loki, OTel collector — see **`scripts/kubernetes/install-istio-docker-desktop.sh`**). **Ambient mesh** is the default on **both** Docker Desktop and Rancher Desktop (**ztunnel** + **`istio-cni`**; workloads do **not** get Envoy sidecars). **North-south** uses **`istio-ingress` / `clawql-mcp-ingress`**: **LoadBalancer Service** (docker/rancher contexts) or **`hostNetwork` + ClusterIP** (other local clusters) plus **Gateway** + **VirtualServices** so **`localhost:80`** and **`*.localhost:80`** work without **`kubectl port-forward`**. **`svc/clawql-mcp-http`** is **ClusterIP** by default under ambient/Istio. **Rancher Desktop:** **`rdctl`** may automatically disable bundled **Traefik** when Traefik owns **:80**. If **`istio-cni`** fails on Rancher’s VM (Lima **`/run`** mount), fix the node (**`mount --make-rshared /`**) or skip mesh (**`CLAWQL_LOCAL_K8S_ISTIO=0`**). **Legacy:** **`CLAWQL_LOCAL_K8S_ISTIO=sidecar make local-k8s-up`**. **Disable mesh:** **`CLAWQL_LOCAL_K8S_ISTIO=0 make local-k8s-up`** (**`off|false|none`** also work).

```bash
make local-k8s-up
# explicit ambient (same as unset): CLAWQL_LOCAL_K8S_ISTIO=ambient make local-k8s-up
# legacy sidecar dataplane: CLAWQL_LOCAL_K8S_ISTIO=sidecar make local-k8s-up
# Chart / addon version (default 1.29.2): CLAWQL_ISTIO_VERSION=1.29.2
# Skip all sample addons (Prometheus, Kiali, …): CLAWQL_ISTIO_INSTALL_KIALI=0
# Skip Grafana + Tempo + Loki + OTel collector only (keep Prometheus + Kiali): CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0
# Skip Grafana Loki only (keep Grafana + Tempo + collector): CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=0
# Opt out of forced mTLS: CLAWQL_ISTIO_APPLY_STRICT_MTLS=0
# Explicit ingress-nginx with Istio (two :80 controllers — avoid): CLAWQL_LOCAL_K8S_INGRESS_NGINX_WITH_ISTIO=1 CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=1
# Omit Istio Envoy host listener: CLAWQL_ISTIO_GATEWAY_HOST_NETWORK=0 (you must attach LB/Ingress separately)
# Skip Istio Gateway + VirtualService (not recommended with STRICT): CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY=0
# Egress allowlist (#275): CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST=1 (sidecar or ambient — gateway values match CLAWQL_LOCAL_K8S_ISTIO_MODE)
# ServiceEntry-only (no istio-egressgateway): CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE=serviceentries
# Keep direct MCP LoadBalancer :8080 (bypass gateway): CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0 make local-k8s-up
```

**mTLS:** By default the install applies **`PeerAuthentication` `STRICT`** in **`clawql`**. Envoy on **`istio-ingress/clawql-mcp-ingress`** is meshed (**ambient** namespaces **`istio-ingress`** + **`ingress-nginx`** when nginx is installed) so **`localhost`/VirtualService → workload** rides **ztunnel mTLS**. If **`ingress-nginx`** is skipped, only the Gateway dataplane terminates browser **`Host`** routing on **:80**.

**MCP + UIs from the host (ambient default):** **`http://localhost/mcp`**, **`http://clawql-mcp.localhost/mcp`**, **`http://clawql.localhost/`**, **`http://onyx.localhost/`**, … sharing the same Envoy **:80** listener. **`CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0`** restores **LoadBalancer :8080** on **`svc/clawql-mcp-http`** while keeping VirtualServices compatible. **gRPC:** **`localhost:50051`** — **`bash scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh`** ( **`grpcurl`** ).

**UIs (namespace `istio-system`):**

| Tool           | Port-forward                                                    | URL                          |
| -------------- | --------------------------------------------------------------- | ---------------------------- |
| **Kiali**      | `kubectl port-forward svc/kiali 20001:20001 -n istio-system`    | http://localhost:20001/kiali |
| **Grafana**    | `kubectl port-forward svc/grafana 3000:3000 -n istio-system`    | http://localhost:3000        |
| **Prometheus** | `kubectl port-forward svc/prometheus 9090:9090 -n istio-system` | http://localhost:9090        |
| **Loki**       | `kubectl port-forward svc/clawql-loki 3100:3100 -n istio-system` | API on **3100** (Grafana datasource **`http://clawql-loki:3100`**) |
| **Tempo**      | `kubectl port-forward svc/clawql-tempo 3200:3200 -n istio-system` | Grafana Tempo datasource **`http://clawql-tempo:3200`** |

**ClawQL MCP → OTLP (optional):** set **`CLAWQL_ENABLE_OTEL_TRACING=1`** and **`OTEL_EXPORTER_OTLP_ENDPOINT=http://clawql-otel-collector.istio-system.svc:4318/v1/traces`** on **`deployment/clawql-mcp-http`** (or add the same under **`extraEnv`** in **`values-docker-desktop.yaml`**) so spans reach **Tempo** via the collector when heavy addons are on. You can instead send OTLP straight to **`http://clawql-tempo.istio-system.svc:4317`** (gRPC) or **`http://clawql-tempo.istio-system.svc:4318`** (HTTP).

**ClawQL MCP → Loki (optional audit push):** **`CLAWQL_LOKI_PUSH_URL=http://clawql-loki.istio-system.svc.cluster.local:3100/loki/api/v1/push`** on **`clawql-mcp-http`** when in-cluster Loki is installed (see **`docs/mcp/mcp-tools.md`** § **`audit`**).

**STRICT mTLS reference:** **`docker/istio/docker-desktop/peerauthentication-clawql-strict.yaml`**.

If the GHCR package is **private**, add **`imagePullSecrets`** via Helm values (same as any private registry).

- **Customize provider or ports:** edit **`charts/clawql-mcp/values-docker-desktop.yaml`** or pass **`helm --set`**; see **[`docs/deployment/helm.md`](../docs/deployment/helm.md)**.
- **`kubectl` / Helm context:** The script picks the first **reachable** context among **`rancher-desktop`**, **`docker-desktop`**, **`docker-for-desktop`** (so a stale `docker-desktop` entry after switching to Rancher Desktop does not win). Override: **`CLAWQL_LOCAL_K8S_CONTEXT=name make local-k8s-up`**. Your default context can stay on EKS when none of those names exist in kubeconfig.
- **Restart behavior:** Deployments keep **`replicas: 1`** and Kubernetes **restarts failed containers** automatically (Pod `restartPolicy` is `Always`).
- **MCP URL:** default **`make local-k8s-up` + Istio** uses **`http://localhost/mcp`** (primary) and **`http://clawql-mcp.localhost/mcp`** (same VirtualService backends). **`CLAWQL_LOCAL_K8S_ISTIO=0`** falls back to **ingress-nginx** + **`values-docker-desktop`** Ingress manifests. **Compose:** **`http://localhost:8080/mcp`**.
- **Cold start:** The MCP container loads every bundled spec before `listen()`; wait until **`curl -s http://localhost/healthz`** (defaults) or **`curl -s http://clawql-mcp.localhost/healthz`** (nginx path) succeeds. **`workflow:complex-release-stack:mcp`** polls **`/healthz`** when **`CLAWQL_MCP_URL`** is set.
- **Bundled docs UI + provider UIs (`website/` source → `ghcr.io/…/clawql-website` image)** stay on **`deployment/clawql-mcp-http-ui`** with **`docs/website/`** as Markdown runbooks only. With **Istio**, **`docker/istio/docker-desktop/clawql-localhost-vs-*.yaml`** mirror the old nginx hostnames (**`http://clawql.localhost`**, **`http://onyx.localhost`**, …) via **`clawql-mcp-ingress`** Envoy (**LoadBalancer** on Docker/Rancher Desktop, **`hostNetwork`** on Linux-style nodes). **`make local-k8s-up`** uninstalls a **stale `ingress-nginx`** Helm release when nginx is auto-skipped — otherwise **`Server: nginx`** **404** means nginx still owns **:80** with **no** Ingress (routes moved to Istio). Manual fix: **`helm uninstall ingress-nginx -n ingress-nginx`**, then rerun **`make local-k8s-up`** or confirm **`kubectl -n istio-ingress get svc clawql-mcp-ingress`** shows **EXTERNAL-IP localhost** (or Envoy on node **:80** if using **hostNetwork**). If UIs flap **502** after mesh upgrades while stale **Envoy sidecars** linger, **`kubectl rollout restart deployment -n clawql`** aligns pods with ambient **ztunnel**.
- **Obsidian vault (`memory_ingest` / `memory_recall`):** Helm defaults to **`vault.hostPath`** so **`$HOME/.ClawQL`** (or **`CLAWQL_LOCAL_VAULT_HOST_PATH`**) is mounted at **`/vault`** — same idea as Compose’s **`CLAWQL_VAULT_HOST_PATH`**. On Docker Desktop, paths such as **`/Users/...`** on macOS are visible to **`hostPath`** pods. If the path is not writable by the pod, MCP now starts in degraded mode (memory tools disabled) and logs a permission-fix command; you can also avoid host permissions entirely with **`CLAWQL_LOCAL_K8S_VAULT_BACKEND=pvc`**.
- **Teardown:** `helm uninstall clawql -n clawql` or `kubectl delete namespace clawql` (also removes non-Helm resources in that namespace). If you used **`CLAWQL_LOCAL_K8S_ISTIO`**, also **`helm uninstall clawql-mcp-ingress -n istio-ingress`** (and consider **`kubectl delete ns istio-ingress`**) when tearing down the mesh gateway. If you installed egress allowlist (**#275**): **`helm uninstall istio-egressgateway -n istio-system`** (or your **`CLAWQL_ISTIO_EGRESS_GATEWAY_NAMESPACE`**). If you installed Loki/Tempo: **`helm uninstall clawql-loki clawql-tempo -n istio-system`** before removing **`istio-system`**.

### Optional: gRPC on Docker Desktop K8s

The Service exposes **8080** (HTTP MCP) and **50051** (gRPC); **`values-docker-desktop.yaml`** uses **LoadBalancer** so the same **`EXTERNAL-IP`** reaches both ports from the host (see **`kubectl -n clawql get svc clawql-mcp-http`**). Enable the listener on the workload:

```bash
kubectl -n clawql set env deployment/clawql-mcp-http ENABLE_GRPC=1
# Optional: so grpcurl can list services without local .proto files
kubectl -n clawql set env deployment/clawql-mcp-http ENABLE_GRPC_REFLECTION=1
kubectl -n clawql rollout status deployment/clawql-mcp-http --timeout=180s
```

With **[grpcurl](https://github.com/fullstorydev/grpcurl)** installed (`brew install grpcurl`), use **`localhost:50051`** through the **Istio gateway** Service, or **`<EXTERNAL-IP>:50051`** for **plaintext** gRPC to **`clawql-mcp-http`** when using **LoadBalancer** (see **`kubectl -n clawql get svc clawql-mcp-http`**).

**`kubectl port-forward`** is only needed when you cannot reach the Service IP or port (e.g. private cluster without Ingress):

```bash
kubectl -n clawql port-forward deployment/clawql-mcp-http 50051:50051
```

Smoke tests:

```bash
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext -d '{"service":""}' localhost:50051 grpc.health.v1.Health/Check
grpcurl -plaintext -d '{"service":"model_context_protocol.Mcp"}' localhost:50051 grpc.health.v1.Health/Check
```

**Note:** Invoking protobuf MCP RPCs such as **`ListTools`** may fail from **`grpcurl`** with errors about **`google.protobuf.Value`** when using reflection alone; the server is still correct—use a client that loads **google well-known types**, or call **`mcp.transport.v1.Mcp.Session`** (JSON-RPC stream) from an MCP-aware client. For production gRPC probes without reflection, use the **`docker/kustomize/overlays/grpc-enabled`** overlay (native **`grpc`** readiness/liveness on **50051**).

### MCP auth (GitHub + optional Cloudflare + Google) on Docker Desktop K8s

Merged **`execute`** calls pick auth per **`specLabel`**: GitHub, Cloudflare, and Google Discovery slugs (e.g. `compute-v1`) each use their own env vars; Slack, Sentry, and n8n use dedicated env vars (not **`CLAWQL_BEARER_TOKEN`**). Paperless, Stirling, Tika, and Gotenberg follow **`src/auth-headers.ts`**. For the **default** merge (**Google + Cloudflare + GitHub + Slack + Paperless + Stirling + Tika + Gotenberg**), set the tokens you need in the cluster.

| Variable                                                      | Required       | Purpose                                                                 |
| ------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| **`CLAWQL_GITHUB_TOKEN`** (or stdin / `gh auth token`)        | Yes for GitHub | PAT; duplicated as **`CLAWQL_BEARER_TOKEN`** for merged-bundle fallback |
| **`CLAWQL_CLOUDFLARE_API_TOKEN`**                             | No             | Cloudflare **`execute`**                                                |
| **`GOOGLE_ACCESS_TOKEN`** or **`CLAWQL_GOOGLE_ACCESS_TOKEN`** | No             | Google Discovery **`execute`**                                          |

The helper script writes Secret **`clawql-github-auth`** (name unchanged for existing installs), injects the keys above into **`deployment/clawql-mcp-http`**, and restarts the rollout. It optionally **`source`s repo `.env`** when present (`CLAWQL_LOAD_DOTENV=0` to skip).

1. **One-shot (recommended):** from the ClawQL repo root, with `gh` logged in **or** tokens in **`.env`**:

   ```bash
   bash scripts/kubernetes/k8s-docker-desktop-set-mcp-auth.sh
   ```

   Optional: `export CLAWQL_CLOUDFLARE_API_TOKEN=…` and/or **`GOOGLE_ACCESS_TOKEN`** / **`CLAWQL_GOOGLE_ACCESS_TOKEN`** in the same shell (or add them to **`.env`**) so the script stores those keys in Secret **`clawql-github-auth`** and attaches them to **`deployment/clawql-mcp-http`**, then **`rollout restart`**s it.

   You can also pipe a PAT: `gh auth token | bash scripts/kubernetes/k8s-docker-desktop-set-mcp-auth.sh`, or `export CLAWQL_GITHUB_TOKEN=…` / `CLAWQL_BEARER_TOKEN=…` before the script.

   The old name **`scripts/kubernetes/k8s-docker-desktop-set-github-token.sh`** still runs the same script (deprecated alias).

2. **Manual:**

   ```bash
   kubectl create secret generic clawql-github-auth -n clawql \
     --from-literal=CLAWQL_GITHUB_TOKEN="$(gh auth token)" \
     --from-literal=CLAWQL_CLOUDFLARE_API_TOKEN="YOUR_CF_TOKEN" \
     --from-literal=GOOGLE_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
     --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n clawql set env deployment/clawql-mcp-http \
     --from=secret/clawql-github-auth --keys=CLAWQL_GITHUB_TOKEN,CLAWQL_CLOUDFLARE_API_TOKEN,GOOGLE_ACCESS_TOKEN --overwrite
   kubectl -n clawql rollout restart deployment/clawql-mcp-http
   ```

**Note:** **`helm upgrade --install`** reapplies chart values; env injected only via **`kubectl set env`** can be overwritten on the next upgrade. Prefer **`helm --set extraEnv`** or a **Secret** referenced from **`values.yaml`** for durable config.

For remote clusters, use `docker/kustomize/overlays/dev` or `prod` and `scripts/deploy/deploy-k8s.sh` with a pushed image, or install the Helm chart with your registry image.

Cloud Run deployment guide/script:

- [`docs/deployment/deploy-cloud-run.md`](../docs/deployment/deploy-cloud-run.md)
- `scripts/deploy/deploy-cloud-run.sh`

## Kubernetes starter manifest

Apply the starter manifest:

```bash
kubectl apply -f docker/kubernetes-starter.yaml
```

Included resources:

- Namespace: `clawql`
- Deployment: `clawql-mcp-http`
- Service: `clawql-mcp-http` (`LoadBalancer`)
- MCP pod: **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** with an **`emptyDir`** volume at `/vault` in the starter and Kustomize **base** (`docker/kustomize/base/deployment-mcp-http.yaml`) so **`memory_ingest`** / **`memory_recall`** can run. For a **persistent** host vault (e.g. **`~/.ClawQL`**), use the **`local`** overlay via **`make local-k8s-up`**, which generates a **`hostPath`** patch — or replace **`emptyDir`** with a PVC or **`hostPath`** yourself. **`sandbox_exec`:** use chart **`sandboxDocker`** (local Helm) / Compose socket mount, or **`CLAWQL_SANDBOX_BRIDGE_URL`** + token — see [`.env.example`](../.env.example) and [`docs/mcp/mcp-tools.md`](../docs/mcp/mcp-tools.md).

After the external IP is ready, use:

- `http://<external-ip>/mcp`

## Kustomize overlay: gRPC + kubelet gRPC probes

When you run **`ENABLE_GRPC=1`**, use **`docker/kustomize/overlays/grpc-enabled/`**: it sets that env and switches **readiness** / **liveness** to **native Kubernetes `grpc` probes** on port **50051**. The **kubelet** implements the [gRPC health protocol](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/#grpc-probes); you do **not** need **`grpc_health_probe`** in the container. **Startup** stays **`httpGet` `/healthz`** so slow spec preload still passes.

```bash
kubectl apply -k docker/kustomize/overlays/grpc-enabled
```

The **base** overlay keeps **HTTP** probes only because gRPC is off by default (nothing listens on **50051**).

## Kustomize overlays (dev/prod)

Kustomize base + overlays are under:

- `docker/kustomize/base`
- `docker/kustomize/overlays/dev`
- `docker/kustomize/overlays/prod`
- `docker/kustomize/overlays/grpc-enabled` (HTTP + gRPC + `grpc` probes; see above)

Set image/tag at apply time:

```bash
# Example image in Artifact Registry
IMAGE="us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp"
TAG="v1.0.0"

kubectl apply -k docker/kustomize/overlays/dev \
  --dry-run=client -o yaml \
  | sed "s|image: clawql-mcp:dev|image: ${IMAGE}:${TAG}|g" \
  | kubectl apply -f -
```

Or edit overlay `images` fields directly:

- dev: `docker/kustomize/overlays/dev/kustomization.yaml`
- prod: `docker/kustomize/overlays/prod/kustomization.yaml`

Helper script (image/tag injection + apply):

```bash
ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> \
bash scripts/deploy/deploy-k8s.sh
```

Dry run:

```bash
ENV=prod IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> DRY_RUN=true \
bash scripts/deploy/deploy-k8s.sh
```

Defaults:

- **dev**: lower resources, single replica, MCP service `ClusterIP`
- **prod**: higher resources, multiple replicas, MCP service `LoadBalancer`

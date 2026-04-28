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

**Sandbox (`sandbox_exec`):** Not bundled. Set **`CLAWQL_ENABLE_SANDBOX=1`** to register the tool, then **`CLAWQL_SANDBOX_BRIDGE_URL`** + **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** (and/or **`CLAWQL_SANDBOX_BACKEND`**) for a deployed [sandbox bridge](../cloudflare/sandbox-bridge/README.md) Worker or local backends; the container only calls the bridge over HTTPS when that path is used.

Full MCP tool list and JSON examples: **[`docs/mcp-tools.md`](../docs/mcp-tools.md)**.

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

**Conflict with Kubernetes:** If you use **`make local-k8s-up`** (ClawQL in the **`clawql`** namespace), **do not** run Compose on the same machine. Both stacks bind **`localhost:8080`** (MCP) and **`localhost:4000`** (GraphQL). Stop Compose first: `docker compose -f docker/docker-compose.yml down`. Prefer **one** local runtime: either Compose **or** K8s (recommended when Langfuse or other workloads already run in-cluster).

Run both services together (containers use **`restart: unless-stopped`** so they come back after Docker Desktop or host reboot):

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Or from the repo root:

```bash
make local-docker-up
```

Endpoints:

- MCP HTTP: `http://localhost:8080/mcp`
- MCP health: `http://localhost:8080/healthz`
- GraphQL proxy: `http://localhost:4000/graphql`

**Cursor MCP:** use a Streamable HTTP server whose URL points at your MCP endpoint (default for this compose/K8s setup: `http://localhost:8080/mcp`). Do not assume everyone uses the same URL — copy `.cursor/mcp.json.example` to `.cursor/mcp.json` (gitignored) and set `url` to localhost, a tunnel, or your cluster ingress. You can also set **`${env:VAR}`** in `url` via [Cursor config interpolation](https://cursor.com/docs/context/mcp) if you prefer env-based URLs.

## Kubernetes on Docker Desktop (Helm default, Kustomize optional)

1. Enable **Kubernetes** in Docker Desktop (Settings → Kubernetes → Enable cluster).
2. Install **[Helm 3](https://helm.sh/docs/intro/install/)** on your PATH (**required** for every `local-k8s-up` path — the script installs **Kyverno** via Helm).
3. From the repo root, **`make local-k8s-up`** installs **Kyverno** (namespace **`kyverno`**) and applies a **ClusterPolicy** that **enforces Cosign (keyless)** signatures for **`ghcr.io/danielsmithdevelopment/clawql-mcp*`** and **`clawql-website*`** in the **`clawql`** release namespace only. It then runs **`helm upgrade --install`** with **`charts/clawql-mcp/values-docker-desktop.yaml`**: LoadBalancer on **8080**, signed **`ghcr.io/.../clawql-mcp:latest`** and **`ghcr.io/.../clawql-website:latest`** (`pullPolicy: Always`), **`all-providers`**, and a **`hostPath`** vault at **`$HOME/.ClawQL`** (override **`CLAWQL_LOCAL_VAULT_HOST_PATH`**). The cluster must reach **Rekor** / Sigstore for verification.

```bash
make local-k8s-up
# or: bash scripts/kubernetes/local-k8s-docker-desktop.sh
```

If Helm errors with **invalid ownership** (MCP was previously installed with **`kubectl apply`** / Kustomize), remove the old workload and reinstall: **`make local-k8s-mcp-delete && make local-k8s-up`**.

**Kustomize instead of Helm for ClawQL manifests:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize make local-k8s-up`** still uses **Helm** for **Kyverno**, then **`kubectl apply -k docker/kustomize/overlays/local`** and applies the same **ClusterPolicy** via **`helm template … --show-only`**.

**Unsigned local images are not supported** on this path: **`CLAWQL_LOCAL_K8S_BUILD_IMAGE=1`** and **`CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE=1`** are rejected (Kyverno would block unsigned **`clawql-mcp`** / **`clawql-website`**). For local iteration from source without cluster admission, use **`make local-docker-up`** (Compose) or push a branch build to GHCR and point **`image.tag`** at that digest or tag.

### Optional: Istio + observability stack (Docker Desktop, local mesh)

**Long-form beginner guide (each tool explained):** **[`docs/deployment/docker-desktop-istio-observability.md`](../docs/deployment/docker-desktop-istio-observability.md)**. This README keeps install commands, env toggles, and port-forward shortcuts.

For **east-west mesh identity and mTLS** between workloads in the **`clawql`** namespace (issue [#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)), set **`CLAWQL_LOCAL_K8S_ISTIO=ambient`** or **`CLAWQL_LOCAL_K8S_ISTIO=sidecar`** before **`make local-k8s-up`**. Prefer **`ambient`** on resource-constrained Docker Desktop (**`sidecar`** adds an envoy container to every pod in **`clawql`**, including the full Onyx / Flink stack). The script runs **`scripts/kubernetes/install-istio-docker-desktop.sh`** after **ingress-nginx** and before the ClawQL install: **Helm** charts **`istio/base`**, **`istiod`**, and (ambient only) **`istio-cni`** + **`ztunnel`** in **`istio-system`**, then **`istio/gateway`** (release **`clawql-mcp-ingress`**) in **`istio-ingress`** plus **Istio `Gateway`** + **`VirtualService`** for MCP, then upstream **Prometheus**, **Kiali**, **Grafana**, and **Jaeger** (Istio **`samples/addons`**) plus an in-repo **OpenTelemetry Collector** that forwards app OTLP to Jaeger. The release namespace is labeled for the dataplane (**`istio.io/dataplane-mode=ambient`** or **`istio-injection=enabled`**).

```bash
CLAWQL_LOCAL_K8S_ISTIO=ambient make local-k8s-up
# Chart / addon version (default 1.29.2): CLAWQL_ISTIO_VERSION=1.29.2
# Skip all sample addons (Prometheus, Kiali, …): CLAWQL_ISTIO_INSTALL_KIALI=0
# Skip Grafana + Jaeger + OTel collector only (keep Prometheus + Kiali): CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0
# Opt out of forced mTLS: CLAWQL_ISTIO_APPLY_STRICT_MTLS=0
# No ingress-nginx (e.g. CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=0): CLAWQL_ISTIO_MESH_INGRESS_NGINX=0
# Skip Istio Gateway + VirtualService (not recommended with STRICT): CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY=0
# Keep chart LoadBalancer on :8080 (skip ClusterIP patch): CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0
```

**mTLS:** By default the install applies **`PeerAuthentication` `STRICT`** in **`clawql`** so **pod traffic must use mesh mTLS**. **`ingress-nginx`** is enrolled in the same dataplane (**`CLAWQL_ISTIO_MESH_INGRESS_NGINX=1`**, default) and the controller is **rollout-restarted** so **Ingress → ClawQL** (for example **`http://clawql.localhost`**) stays on an authenticated mesh path. **East-west** between workloads in **`clawql`** is STRICT as well.

**MCP from the host (recommended with Istio):** use **`kubectl -n istio-ingress get svc clawql-mcp-ingress`**: **`http://localhost/mcp`** and **`http://localhost/healthz`** on **port 80**, and **gRPC** on **`localhost:50051`**. That path uses **`Gateway`** + **`VirtualService`** to **`clawql-mcp-http`**, so traffic into **`clawql`** is **meshed** under **STRICT**. After **`make local-k8s-up`** with the gateway on, **`local-k8s-docker-desktop.sh`** patches **`svc/clawql-mcp-http`** to **`ClusterIP`** by default (no second public **LoadBalancer** on **:8080**). Opt out: **`CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0`**. Validate gRPC through the gateway: **`bash scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh`** (requires **`grpcurl`**).

**UIs (namespace `istio-system`):**

| Tool           | Port-forward                                                    | URL                          |
| -------------- | --------------------------------------------------------------- | ---------------------------- |
| **Kiali**      | `kubectl port-forward svc/kiali 20001:20001 -n istio-system`    | http://localhost:20001/kiali |
| **Grafana**    | `kubectl port-forward svc/grafana 3000:3000 -n istio-system`    | http://localhost:3000        |
| **Prometheus** | `kubectl port-forward svc/prometheus 9090:9090 -n istio-system` | http://localhost:9090        |
| **Jaeger**     | `kubectl port-forward svc/tracing 16686:80 -n istio-system`     | http://localhost:16686       |

**ClawQL MCP → OTLP (optional):** set **`CLAWQL_ENABLE_OTEL_TRACING=1`** and **`OTEL_EXPORTER_OTLP_ENDPOINT=http://clawql-otel-collector.istio-system.svc:4318/v1/traces`** on **`deployment/clawql-mcp-http`** (or add the same under **`extraEnv`** in **`values-docker-desktop.yaml`**) so spans land in **Jaeger** via the collector. You can instead send OTLP straight to **`http://jaeger-collector.istio-system.svc:4318`** (Jaeger v2 all-in-one exposes OTLP on that Service).

**STRICT mTLS reference:** **`docker/istio/docker-desktop/peerauthentication-clawql-strict.yaml`**.

If the GHCR package is **private**, add **`imagePullSecrets`** via Helm values (same as any private registry).

- **Customize provider or ports:** edit **`charts/clawql-mcp/values-docker-desktop.yaml`** or pass **`helm --set`**; see **[`docs/deployment/helm.md`](../docs/deployment/helm.md)**.
- **`kubectl` / Helm context:** The script targets **`docker-desktop`** when that context exists (so your default context can stay on EKS or another cluster).
- **Restart behavior:** Deployments keep **`replicas: 1`** and Kubernetes **restarts failed containers** automatically (Pod `restartPolicy` is `Always`).
- **MCP URL:** without Istio, **`http://localhost:8080/mcp`** once **`kubectl -n clawql get svc clawql-mcp-http`** shows an address (often **`localhost`** on Docker Desktop). With **`CLAWQL_LOCAL_K8S_ISTIO`**, prefer **`http://localhost/mcp`** on **`kubectl -n istio-ingress get svc clawql-mcp-ingress`** port **80** (see _Optional: Istio + observability stack_ above).
- **Cold start:** The MCP container loads every bundled spec before `listen()`; hitting the MCP URL too early can produce `fetch failed` / “other side closed” in Node. Wait until **`curl -s http://localhost/healthz`** (Istio gateway) or **`curl -s http://localhost:8080/healthz`** (direct LB) returns `{"status":"ok"…}` or the pod is **Ready** (the MCP Deployment includes `/healthz` startup/readiness probes). The `workflow:complex-release-stack:mcp` script polls `/healthz` when `CLAWQL_MCP_URL` is set.
- **Obsidian vault (`memory_ingest` / `memory_recall`):** Helm sets **`vault.hostPath`** so **`$HOME/.ClawQL`** (or **`CLAWQL_LOCAL_VAULT_HOST_PATH`**) is mounted at **`/vault`** — same idea as Compose’s **`CLAWQL_VAULT_HOST_PATH`**. On Docker Desktop, paths such as **`/Users/...`** on macOS are visible to **`hostPath`** pods.
- **Teardown:** `helm uninstall clawql -n clawql` or `kubectl delete namespace clawql` (also removes non-Helm resources in that namespace). If you used **`CLAWQL_LOCAL_K8S_ISTIO`**, also **`helm uninstall clawql-mcp-ingress -n istio-ingress`** (and consider **`kubectl delete ns istio-ingress`**) when tearing down the mesh gateway.

### Optional: gRPC on Docker Desktop K8s

The Service exposes **8080** (HTTP MCP) and **50051** (gRPC). Enable the listener on the workload:

```bash
kubectl -n clawql set env deployment/clawql-mcp-http ENABLE_GRPC=1
# Optional: so grpcurl can list services without local .proto files
kubectl -n clawql set env deployment/clawql-mcp-http ENABLE_GRPC_REFLECTION=1
kubectl -n clawql rollout status deployment/clawql-mcp-http --timeout=180s
```

With **[grpcurl](https://github.com/fullstorydev/grpcurl)** installed (`brew install grpcurl`), use the Service’s **gRPC** port (**`50051`**) on the LoadBalancer / ClusterIP (see **`kubectl -n clawql get svc clawql-mcp-http`** — both **http** and **grpc** should appear). On Docker Desktop that is usually **`localhost:50051`** alongside **`localhost:8080`**.

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
- MCP pod: **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** with an **`emptyDir`** volume at `/vault` in the starter and Kustomize **base** (`docker/kustomize/base/deployment-mcp-http.yaml`) so **`memory_ingest`** / **`memory_recall`** can run. For a **persistent** host vault (e.g. **`~/.ClawQL`**), use the **`local`** overlay via **`make local-k8s-up`**, which generates a **`hostPath`** patch — or replace **`emptyDir`** with a PVC or **`hostPath`** yourself. **`sandbox_exec`** still requires **`CLAWQL_SANDBOX_BRIDGE_URL`** + token env (see [`.env.example`](../.env.example) and [`docs/mcp-tools.md`](../docs/mcp-tools.md)).

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

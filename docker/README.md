# ClawQL MCP container

Slim [Distroless](https://github.com/GoogleContainerTools/distroless) image with production dependencies, compiled `dist/`, `bin/`, and bundled `providers/` for offline spec lookup.

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

**Sandbox (`sandbox_exec`):** Not bundled. Set **`CLAWQL_SANDBOX_BRIDGE_URL`** and **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** to a deployed [sandbox bridge](../cloudflare/sandbox-bridge/README.md) Worker; the container only calls it over HTTPS.

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

Future Compose / Kubernetes / Helm manifests can live under `docker/` (or split to `deploy/`) without changing this image.

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

## Kubernetes on Docker Desktop (local image)

1. Enable **Kubernetes** in Docker Desktop (Settings → Kubernetes → Enable cluster).
2. Build the image and apply the **`local`** overlay (LoadBalancer on **8080** for MCP):

```bash
make local-k8s-up
# or: bash scripts/local-k8s-docker-desktop.sh
```

This tags **`clawql-mcp:latest`** (same daemon as Docker Desktop; no registry push). The overlay lives at `docker/kustomize/overlays/local`.

- **`CLAWQL_PROVIDER`:** The **local** overlay sets **`default-multi-provider`** (Google top50 + Cloudflare + GitHub, same as bare `npx clawql-mcp`). Edit `docker/kustomize/overlays/local/patch-local-provider-env.yaml` to **`all-providers`** when you need the full merge for multi-vendor MCP or **`workflow:complex-release-stack:mcp`** over HTTP. The **base** manifest defaults to **`google-top50`** when no overlay patch applies.
- **`kubectl` context:** The script targets **`docker-desktop`** when that context exists (so your default context can stay on EKS or another cluster).
- **Restart behavior:** Deployments keep **`replicas: 1`** and Kubernetes **restarts failed containers** automatically (Pod `restartPolicy` is `Always`).
- **MCP URL:** `http://localhost:8080/mcp` once `kubectl -n clawql get svc clawql-mcp-http` shows an external address (often `localhost` on Docker Desktop).
- **Cold start:** The MCP container loads every bundled spec before `listen()`; hitting `:8080` too early can produce `fetch failed` / “other side closed” in Node. Wait until `curl http://localhost:8080/healthz` returns `{"status":"ok"…}` or the pod is **Ready** (the MCP Deployment includes `/healthz` startup/readiness probes). The `workflow:complex-release-stack:mcp` script polls `/healthz` when `CLAWQL_MCP_URL` is set.
- **Obsidian vault (`memory_ingest` / `memory_recall`):** The **`local`** overlay replaces the base **`emptyDir`** volume with a **`hostPath`** mount so notes persist on the Docker Desktop host. **`scripts/local-k8s-docker-desktop.sh`** writes **`patch-mcp-vault-hostpath.json`** (RFC 6902 JSON Patch replacing **`volumes[0]`**, gitignored) before **`kubectl apply -k`**, defaulting to **`$HOME/.ClawQL`** — same default as Compose’s **`CLAWQL_VAULT_HOST_PATH`**. Override with **`CLAWQL_LOCAL_VAULT_HOST_PATH=/absolute/path/to/vault`** when applying. **Do not** run raw **`kubectl apply -k docker/kustomize/overlays/local`** without generating that patch first (use **`make local-k8s-up`**). On Docker Desktop, shared filesystem paths such as **`/Users/...`** on macOS are visible to **`hostPath`** pods.
- **Teardown:** `kubectl delete namespace clawql` (or `kubectl --context docker-desktop delete namespace clawql`)

### Optional: gRPC on Docker Desktop K8s

The Service exposes **8080** (HTTP MCP) and **50051** (gRPC) when you use the **local** overlay. Enable the listener on the workload:

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

### GitHub + Cloudflare + Google API auth on Docker Desktop K8s

Merged **`execute`** calls pick the bearer per **`specLabel`**: GitHub, Cloudflare, and Google top50 API slugs (e.g. `compute-v1`) each use their own env vars (see `src/auth-headers.ts`). **`CLAWQL_BEARER_TOKEN`** remains a fallback for other vendors. For the default **Google top50 + Cloudflare + GitHub** bundle, set all three token types in the cluster when you need live calls to every provider.

1. **One-shot (recommended):** from the ClawQL repo root, with `gh` logged in:

   ```bash
   bash scripts/k8s-docker-desktop-set-github-token.sh
   ```

   Optional: `export CLAWQL_CLOUDFLARE_API_TOKEN=…` and/or **`GOOGLE_ACCESS_TOKEN`** / **`CLAWQL_GOOGLE_ACCESS_TOKEN`** in the same shell so the script stores those keys in Secret **`clawql-github-auth`** and attaches them to **`deployment/clawql-mcp-http`**, then **`rollout restart`**s it.

   You can also pipe a PAT: `gh auth token | bash scripts/k8s-docker-desktop-set-github-token.sh`, or `export CLAWQL_GITHUB_TOKEN=…` / `CLAWQL_BEARER_TOKEN=…` before the script.

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

**Note:** Re-applying the Kustomize overlay (`kubectl apply -k docker/kustomize/overlays/local`) resets the Deployment to the YAML on disk and **drops** env injected only via `kubectl set env`. Re-run the script after a full re-apply, or add a permanent `secretKeyRef` patch to your overlay.

For remote clusters, use `docker/kustomize/overlays/dev` or `prod` and `scripts/deploy-k8s.sh` with a pushed image.

Cloud Run deployment guide/script:

- [`docs/deploy-cloud-run.md`](../docs/deploy-cloud-run.md)
- `scripts/deploy-cloud-run.sh`

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
bash scripts/deploy-k8s.sh
```

Dry run:

```bash
ENV=prod IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> DRY_RUN=true \
bash scripts/deploy-k8s.sh
```

Defaults:

- **dev**: lower resources, single replica, MCP service `ClusterIP`
- **prod**: higher resources, multiple replicas, MCP service `LoadBalancer`

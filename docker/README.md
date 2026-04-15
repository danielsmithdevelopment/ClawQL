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

Single-spec `execute` uses a GraphQL proxy at `GRAPHQL_URL` (default `http://localhost:4000/graphql`). Point it at a reachable proxy or use multi-spec presets (REST execution) when you do not run the proxy beside the container.

**Obsidian vault:** The image sets **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** and includes a writable **`/vault`** directory for **`memory_ingest`** / **`memory_recall`** and **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)**. Compose mounts a named volume at `/vault`; override the path or mount your host Obsidian folder as needed. See the main [README](../README.md#obsidian-vault-optional).

**Sandbox (`sandbox_exec`):** Not bundled. Set **`CLAWQL_SANDBOX_BRIDGE_URL`** and **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** to a deployed [sandbox bridge](../cloudflare/sandbox-bridge/README.md) Worker; the container only calls it over HTTPS.

Full MCP tool list and JSON examples: **[`docs/mcp-tools.md`](../docs/mcp-tools.md)**.

## Run (stdio, optional)

If you specifically want stdio mode in a container:

```bash
docker run -i --rm --entrypoint node clawql-mcp dist/server.js
```

## Layout

| Path | Purpose |
|------|---------|
| `docker/Dockerfile` | Multi-stage build → distroless runtime |
| `.dockerignore` | Keeps build context small (root; used by `docker build` from `.`) |
| `docker/docker-compose.yml` | Local two-service stack (`clawql-mcp-http` + `clawql-graphql`) |
| `docker/kubernetes-starter.yaml` | Starter K8s namespace + Deployments + Services |

Future Compose / Kubernetes / Helm manifests can live under `docker/` (or split to `deploy/`) without changing this image.

## Docker Compose (local)

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
- **Teardown:** `kubectl delete namespace clawql` (or `kubectl --context docker-desktop delete namespace clawql`)

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
- Deployments: `clawql-mcp-http`, `clawql-graphql`
- Services: internal `clawql-graphql` + external `clawql-mcp-http` (`LoadBalancer`)
- MCP pod: **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** with an **`emptyDir`** volume at `/vault` (aligned with `docker/kustomize/base/deployment-mcp-http.yaml`) so **`memory_ingest`** / **`memory_recall`** can run. Replace `emptyDir` with a PVC or hostPath when you need a persistent Obsidian folder. **`sandbox_exec`** still requires **`CLAWQL_SANDBOX_BRIDGE_URL`** + token env (see [`.env.example`](../.env.example) and [`docs/mcp-tools.md`](../docs/mcp-tools.md)).

After the external IP is ready, use:
- `http://<external-ip>/mcp`

## Kustomize overlays (dev/prod)

Kustomize base + overlays are under:
- `docker/kustomize/base`
- `docker/kustomize/overlays/dev`
- `docker/kustomize/overlays/prod`

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

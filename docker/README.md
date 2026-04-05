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

- **`CLAWQL_PROVIDER`:** The **local** overlay sets **`all-providers`** (Google top50 + Cloudflare, GitHub, Jira, …) so multi-vendor MCP clients and **`workflow:complex-release-stack:mcp`** over HTTP behave like stdio. This uses more memory than **`google-top50`** alone; the **base** manifest still defaults to **`google-top50`** for lighter clusters.
- **`kubectl` context:** The script targets **`docker-desktop`** when that context exists (so your default context can stay on EKS or another cluster).
- **Restart behavior:** Deployments keep **`replicas: 1`** and Kubernetes **restarts failed containers** automatically (Pod `restartPolicy` is `Always`).
- **MCP URL:** `http://localhost:8080/mcp` once `kubectl -n clawql get svc clawql-mcp-http` shows an external address (often `localhost` on Docker Desktop).
- **Cold start:** The MCP container loads every bundled spec before `listen()`; hitting `:8080` too early can produce `fetch failed` / “other side closed” in Node. Wait until `curl http://localhost:8080/healthz` returns `{"status":"ok"…}` or the pod is **Ready** (the MCP Deployment includes `/healthz` startup/readiness probes). The `workflow:complex-release-stack:mcp` script polls `/healthz` when `CLAWQL_MCP_URL` is set.
- **Teardown:** `kubectl delete namespace clawql` (or `kubectl --context docker-desktop delete namespace clawql`)

### GitHub API auth (`CLAWQL_BEARER_TOKEN`) on Docker Desktop K8s

ClawQL adds `Authorization: Bearer …` from **`CLAWQL_BEARER_TOKEN`** (see `src/rest-operation.ts`). For **`issues/create`** and other GitHub `execute` calls, set it in the cluster:

1. **One-shot (recommended):** from the ClawQL repo root, with `gh` logged in:

   ```bash
   bash scripts/k8s-docker-desktop-set-github-token.sh
   ```

   This creates/updates Secret **`clawql-github-auth`** in namespace **`clawql`**, attaches **`CLAWQL_BEARER_TOKEN`** to **`deployment/clawql-mcp-http`**, and **`rollout restart`**s it.

   You can also pipe a PAT: `gh auth token | bash scripts/k8s-docker-desktop-set-github-token.sh`, or `export CLAWQL_BEARER_TOKEN=…` before the script.

2. **Manual:**

   ```bash
   kubectl create secret generic clawql-github-auth -n clawql \
     --from-literal=CLAWQL_BEARER_TOKEN="$(gh auth token)" \
     --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n clawql set env deployment/clawql-mcp-http \
     --from=secret/clawql-github-auth --keys=CLAWQL_BEARER_TOKEN --overwrite
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

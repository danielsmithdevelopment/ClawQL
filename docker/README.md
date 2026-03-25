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

Run both services together:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Endpoints:
- MCP HTTP: `http://localhost:8080/mcp`
- MCP health: `http://localhost:8080/healthz`
- GraphQL proxy: `http://localhost:4000/graphql`

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

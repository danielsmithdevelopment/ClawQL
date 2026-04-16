# Deploy ClawQL on Kubernetes (Kustomize)

This deploy pattern runs ClawQL as **one** workload (**`clawql-mcp-http`**): MCP at **`/mcp`**, GraphQL at **`/graphql`** on the same service.

## Prerequisites

- `kubectl` configured for your target cluster
- image pushed to a registry your cluster can pull from
- manifests in `docker/kustomize/`

## Kustomize layout

- Base: `docker/kustomize/base`
- Overlays:
  - `docker/kustomize/overlays/dev`
  - `docker/kustomize/overlays/prod`

Overlay defaults:

- **dev**: lower resources, single replica, MCP service is `ClusterIP`
- **prod**: higher resources, multiple replicas, MCP service is `LoadBalancer`

## One-shot helper script

Use the provided script from repo root:

```bash
ENV=dev \
IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp \
TAG=abc123 \
bash scripts/deploy-k8s.sh
```

Dry-run:

```bash
ENV=prod \
IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp \
TAG=v1.0.0 \
DRY_RUN=true \
bash scripts/deploy-k8s.sh
```

## Make target

Equivalent via `make`:

```bash
ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=abc123 make deploy-k8s
```

## What the script does

1. Chooses overlay (`ENV=dev|prod`).
2. Renders manifests with `kubectl kustomize`.
3. Rewrites image references to `${IMAGE}:${TAG}`.
4. Applies with `kubectl apply -f -` (or dry-run).

## Endpoints

- In **dev** (`ClusterIP`): expose MCP via port-forward or Ingress.
- In **prod** (`LoadBalancer`): endpoint is typically:
  - `http://<external-ip>/mcp`
  - health: `http://<external-ip>/healthz`

## Notes

- If your cluster uses Ingress/Gateway, switch `clawql-mcp-http` service type from `LoadBalancer` to `ClusterIP` in prod and route externally via your ingress layer.
- Keep `CLAWQL_PROVIDER` scoped to the smallest useful preset to reduce memory and startup time.

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

- **HTTP MCP:** path **`/mcp`** on the Service’s HTTP port (see below).
- **Health:** **`/healthz`** on the same HTTP port.

### Service ports (HTTP and gRPC)

All Kustomize layers (**`base`**, **`dev`**, **`local`**, **`prod`**) define **`clawql-mcp-http`** with **two** ports:

| Name   | Service `port`                                      | `targetPort`                     | Purpose                                                                |
| ------ | --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `http` | **dev:** 8080 · **local:** 8080 · **base/prod:** 80 | 8080                             | Streamable HTTP MCP, **`/healthz`**                                    |
| `grpc` | **50051**                                           | **`grpc`** (container **50051**) | **`ENABLE_GRPC=1`**: `grpc.health.v1`, `model_context_protocol.Mcp`, … |

- **dev** (`ClusterIP`): from inside the cluster, e.g. `http://clawql-mcp-http.clawql.svc.cluster.local:8080/mcp` and **`clawql-mcp-http.clawql.svc.cluster.local:50051`** for gRPC. From your laptop, **`kubectl port-forward`** to either port or use Ingress / VPN, depending on how you expose the cluster.
- **prod** (`LoadBalancer`): **`http://<external-ip>/mcp`** (port **80** maps to container **8080**). For gRPC, use **`<external-ip>:50051`** (plaintext or TLS per your LB / cloud—many L4 load balancers forward TCP **50051** alongside **80**).
- **local** (Docker Desktop): often **`http://localhost:8080/mcp`** and **`localhost:50051`** for gRPC when the LoadBalancer maps both.

Nothing listens on **50051** until the Pod has **`ENABLE_GRPC=1`** (set in your overlay or `kubectl set env`). You do **not** need a separate port-forward for gRPC **if** the Service exposes **50051** and your network path can reach it.

## Notes

- If your cluster uses Ingress/Gateway, switch `clawql-mcp-http` service type from `LoadBalancer` to `ClusterIP` in prod and route externally via your ingress layer.
- Keep `CLAWQL_PROVIDER` scoped to the smallest useful preset to reduce memory and startup time.

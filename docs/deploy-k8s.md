# Deploy ClawQL on Kubernetes (Kustomize or Helm)

This deploy pattern runs ClawQL as **one** workload (**`clawql-mcp-http`**): MCP at **`/mcp`**, GraphQL at **`/graphql`** on the same service.

## Helm chart (alternative)

For **`helm install` / `helm upgrade`**, use the maintained chart at **`charts/clawql-mcp`**. See **[`docs/helm.md`](helm.md)** for install examples, values, private registry pull secrets, Ingress, and persistence.

Quick start from repo root:

```bash
helm upgrade --install clawql ./charts/clawql-mcp --namespace clawql --create-namespace --wait
```

For Docker Desktop Helm installs that enable the bundled website UI (`ui.enabled=true`, `ui.ingress.enabled=true`), open local docs at **`http://clawql.localhost`**.

## Prerequisites (Kustomize)

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

The Helm chart (**`charts/clawql-mcp`**, including **`values-docker-desktop.yaml`** for Docker Desktop) and all Kustomize layers (**`base`**, **`dev`**, **`prod`**) define **`clawql-mcp-http`** with **two** ports:

| Name   | Service `port`                                          | `targetPort`                     | Purpose                                                                |
| ------ | ------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `http` | **dev / Helm Docker Desktop:** 8080 · **base/prod:** 80 | 8080                             | Streamable HTTP MCP, **`/healthz`**                                    |
| `grpc` | **50051**                                               | **`grpc`** (container **50051**) | **`ENABLE_GRPC=1`**: `grpc.health.v1`, `model_context_protocol.Mcp`, … |

- **dev** (`ClusterIP`): from inside the cluster, e.g. `http://clawql-mcp-http.clawql.svc.cluster.local:8080/mcp` and **`clawql-mcp-http.clawql.svc.cluster.local:50051`** for gRPC. From your laptop, **`kubectl port-forward`** to either port or use Ingress / VPN, depending on how you expose the cluster.
- **prod** (`LoadBalancer`): **`http://<external-ip>/mcp`** (port **80** maps to container **8080**). For gRPC, use **`<external-ip>:50051`** (plaintext or TLS per your LB / cloud—many L4 load balancers forward TCP **50051** alongside **80**).
- **Docker Desktop (Helm `values-docker-desktop.yaml`):** often **`http://localhost:8080/mcp`** and **`localhost:50051`** for gRPC when the LoadBalancer maps both.

Nothing listens on **50051** until the Pod has **`ENABLE_GRPC=1`** (set in your overlay or `kubectl set env`). You do **not** need a separate port-forward for gRPC **if** the Service exposes **50051** and your network path can reach it.

### TLS, mTLS, and service meshes

Application-level TLS and optional client certificate verification on the gRPC listener use **`GRPC_TLS_CERT_PATH`**, **`GRPC_TLS_KEY_PATH`**, optional **`GRPC_TLS_CA_PATH`**, and **`GRPC_TLS_REQUIRE_CLIENT_CERT`** — see [`packages/mcp-grpc-transport/README.md`](../packages/mcp-grpc-transport/README.md#environment). You may instead terminate TLS on a load balancer or ingress; many teams forward **plain gRPC** to the pod on **50051** inside a trusted network.

**Service meshes** (Istio, Linkerd, Cloudflare, …) are **not** configured inside this repo: route the **`grpc`** port to the workload and apply your mesh’s mTLS and policies. Mesh identity is **orthogonal** to application **`GRPC_TLS_*`** (you might use one or the other, or both, depending on architecture).

**Observability:** ClawQL does **not** bundle Langfuse or a tracing backend. Use **`grpcServerOptions`** (e.g. **OpenTelemetry** interceptors) in **`maybeStartGrpcMcpServer`**, or trace at the agent ([ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)). For gRPC scope and shipped behavior, see [issue #67](https://github.com/danielsmithdevelopment/ClawQL/issues/67).

## Docker Desktop: MCP auth (local cluster)

For **`make local-k8s-up`** on Docker Desktop, inject **GitHub**, **Cloudflare**, and **Google** tokens into the MCP deployment with **`scripts/k8s-docker-desktop-set-mcp-auth.sh`** (optional repo **`.env`**). Secret name on the cluster remains **`clawql-github-auth`** for compatibility. See **[`docker/README.md`](../docker/README.md)** (_MCP auth_) and the site page **[`/kubernetes`](../website/src/app/kubernetes/page.mdx)**.

## Notes

- If your cluster uses Ingress/Gateway, switch `clawql-mcp-http` service type from `LoadBalancer` to `ClusterIP` in prod and route externally via your ingress layer.
- Keep `CLAWQL_PROVIDER` scoped to the smallest useful preset to reduce memory and startup time.
- With **`CLAWQL_ENABLE_CACHE`**, the MCP **`cache`** tool is **per-pod**: each replica has its **own** empty in-process store (LRU). Durable cross-replica state belongs in the vault (**`memory_ingest`** / **`memory_recall`**) or your own backing service — see **[cache-tool.md](cache-tool.md)**.
- With **`CLAWQL_ENABLE_AUDIT`**, the MCP **`audit`** tool is **per-pod**: each replica has its **own** in-process ring buffer — not on disk; use **`memory_ingest`** for durable trails — see **[enterprise-mcp-tools.md](enterprise-mcp-tools.md)** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)).

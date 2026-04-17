# Helm chart (`charts/clawql-mcp`)

The repository ships a **Helm 3** chart that deploys the same workload as Kustomize (**`clawql-mcp-http`**): Streamable HTTP MCP (and optional gRPC) behind a Kubernetes **Service**.

Use this when you prefer **`helm install` / `helm upgrade`** over **`kubectl apply -k`** (see also [`deploy-k8s.md`](deploy-k8s.md) for Kustomize).

## Prerequisites

- Kubernetes 1.24+ (typical for `networking.k8s.io/v1` Ingress)
- [Helm 3](https://helm.sh/)
- An image your cluster can pull (default: **`ghcr.io/danielsmithdevelopment/clawql-mcp`**, multi-arch **amd64** / **arm64** when published from CI)

Private GHCR: create a pull secret and set **`imagePullSecrets`** (see [values](../charts/clawql-mcp/values.yaml)).

## Install from a repo clone

From the **repository root**:

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

Defaults use **`fullnameOverride: clawql-mcp-http`** so resource names match the Kustomize docs (**`kubectl -n clawql get deploy clawql-mcp-http`**).

### Examples

**ClusterIP** (in-cluster only, no cloud LoadBalancer cost):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set service.type=ClusterIP \
  --set service.http.port=8080
```

**Enable gRPC** (port **50051** on the Service; HTTP unchanged):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set enableGrpc=true
```

**Image tag** (pin a digest or release tag):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set image.tag=sha-abc1234
```

**Tokens via existing Secret** (keys become env vars in the pod):

```bash
kubectl -n clawql create secret generic clawql-env --from-literal=CLAWQL_GITHUB_TOKEN="$(gh auth token)"
helm upgrade --install clawql ./charts/clawql-mcp -n clawql \
  --set envFromSecret=clawql-env
```

**Persistent vault** (`memory_ingest` / `memory_recall` survive pod restarts):

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set persistence.enabled=true \
  --set persistence.size=20Gi
```

**Ingress** (optional): set **`ingress.enabled=true`** and edit **`ingress.hosts`** / **`ingress.tls`** in a small values file; backend targets the HTTP **`service.http.port`**.

## Values

See **[`charts/clawql-mcp/values.yaml`](../charts/clawql-mcp/values.yaml)**. Common keys:

| Key                                                 | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `image.repository`, `image.tag`, `image.pullPolicy` | Container image                                |
| `service.type`, `service.http.port`                 | `LoadBalancer` vs `ClusterIP`, front port      |
| `provider`                                          | **`CLAWQL_PROVIDER`** (e.g. `google-top50`)    |
| `enableGrpc` / `enableGrpcReflection`               | gRPC listener on **50051**                     |
| `extraEnv`                                          | Additional container env entries               |
| `envFromSecret`                                     | **`envFrom`** from an existing Secret          |
| `persistence`                                       | PVC for **`/vault`** instead of **`emptyDir`** |
| `ingress`                                           | Optional HTTP(S) Ingress                       |

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

|                          | Kustomize (`docker/kustomize/`)                | Helm (`charts/clawql-mcp`)                                                            |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Naming**               | Overlays **`dev`**, **`prod`**, **`local`**    | **`values.yaml`** + **`--set`**                                                       |
| **Image**                | Rewritten by **`scripts/deploy-k8s.sh`**       | **`image.repository`** / **`image.tag`**                                              |
| **Local Docker Desktop** | **`make local-k8s-up`** (hostPath vault patch) | Use Helm with overrides or stay on Kustomize **`local`** for the scripted vault patch |

For **Docker Desktop** with a **host bind** vault at **`~/.ClawQL`**, the **`local`** Kustomize flow (`scripts/local-k8s-docker-desktop.sh`) is still the most turnkey; Helm can do the same with a custom **`extraVolumes` / `extraVolumeMounts`** patch in a fork, or **`persistence`** with a suitable storage class.

## Chart version

**`Chart.version`** in **`Chart.yaml`** is the chart release; **`appVersion`** tracks the app loosely. The running software version is always the **container image** you deploy.

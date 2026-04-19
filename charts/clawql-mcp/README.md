# `clawql-mcp` Helm chart

Deploys **ClawQL** as **`clawql-mcp-http`**: Streamable HTTP MCP (`/mcp`), health (`/healthz`), GraphQL (`/graphql`), optional gRPC on **50051**.

## Documentation

- **Full guide:** [`docs/helm.md`](../../docs/helm.md) in this repository
- **Kustomize alternative:** [`docs/deploy-k8s.md`](../../docs/deploy-k8s.md)

## Quick install

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --wait
```

Configure via **`values.yaml`** or **`--set`**. Defaults pull **`ghcr.io/danielsmithdevelopment/clawql-mcp:latest`**. **`enableCache`** defaults to **`true`** (MCP **`cache`** tool). **`enableAudit`** defaults to **`false`** — set **`true`** for MCP **`audit`** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)).

**Docker Desktop:** from the repo root, **`make local-k8s-up`** uses **`values-docker-desktop.yaml`** (LoadBalancer **8080**, **`hostPath`** vault). **Kustomize:** **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** uses **`docker/kustomize/overlays/local`** (no Helm).

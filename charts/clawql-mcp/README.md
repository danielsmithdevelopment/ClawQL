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

Configure via **`values.yaml`** or **`--set`**. Defaults pull **`ghcr.io/danielsmithdevelopment/clawql-mcp:latest`**.

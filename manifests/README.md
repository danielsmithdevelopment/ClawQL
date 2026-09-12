# Cluster install artifacts

Istio-style bucket for **what you apply to a cluster**. Image build stays in [`docker/`](../docker/). Cloud programs, GitOps Applications, and hosted-edge Workers stay under [`infra/`](../infra/). Golden AMIs live in [`infra/packer/`](../infra/packer/).

```
manifests/
  charts/          # Helm: clawql-mcp, clawql-idp, clawql-operator, clawql-falco
  kustomize/       # Alternative MCP install (base + overlays)
```

```bash
helm upgrade --install clawql ./manifests/charts/clawql-mcp \
  --namespace clawql --create-namespace --wait

kubectl apply -k manifests/kustomize/overlays/local
```

Guides: [`docs/deployment/helm.md`](../docs/deployment/helm.md), [`docs/deployment/deploy-k8s.md`](../docs/deployment/deploy-k8s.md).

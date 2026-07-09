# clawql-operator (opt-in)

**Tracking:** [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)

This chart installs the **ClawQL Operator scaffold** — it does **not** replace `charts/clawql-mcp`. Existing Helm, Compose, and `npx clawql-mcp` workflows are unchanged.

## What it does today (v0.1)

- Installs the `ClawQLInstance` CRD (`clawql.io/v1alpha1`)
- Runs a periodic reconcile job that validates instance specs and publishes `{instance}-tier-spec` ConfigMaps
- MCP can optionally mount the ConfigMap via `clawql-mcp` chart `instanceSpec.enabled` (default **false**)

## What it does **not** do yet

- Does not create or manage the MCP Deployment
- Does not replace Helm `enable*` values
- Does not reconcile vertical packages or auth/RBAC/RLS

## Install (optional)

```bash
kubectl apply -f deploy/crd/clawqlinstances.clawql.io.yaml   # or rely on chart crd.install
helm upgrade --install clawql-operator ./charts/clawql-operator \
  --namespace clawql-system \
  --create-namespace
kubectl apply -f examples/operator/clawqlinstance-minimal.yaml
```

Wire MCP to operator output (explicit opt-in):

```yaml
# clawql-mcp values overlay
instanceSpec:
  enabled: true
  configMapName: clawql-tier-spec
```

## See also

- [Operator target architecture](../../docs/design/operator-target-architecture.md)
- [Deployment guide](../../docs/deployment/clawql-deployment-operations-guide.md)

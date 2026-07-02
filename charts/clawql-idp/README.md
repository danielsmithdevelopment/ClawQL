# clawql-idp (umbrella chart)

**Tracking:** [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255) · Epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)

Opinionated **umbrella** chart that installs [`clawql-mcp`](../clawql-mcp) with IDP-friendly defaults. It does **not** replace the lean MCP chart for operators who only need the gateway.

## Decision: umbrella vs lean chart

| Approach                             | When to use                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **`charts/clawql-mcp`**              | Production MCP-only, custom flags, minimal footprint                                                                    |
| **`charts/clawql-idp`** (this chart) | k3s / lab **full IDP profile** — document pipeline, OpenClaw, dashboard, workflow/argocd RBAC, NATS, Ouroboros Postgres |
| **Documentation-only stack**         | BYO Argo CD / Langfuse / Label Studio with lean chart + `deployment/` manifests                                         |

All templates live in **`clawql-mcp`**; this chart only passes **values** under the `clawql-mcp:` key.

## Install

```bash
helm dependency update charts/clawql-idp

helm upgrade --install clawql-idp charts/clawql-idp \
  -f charts/clawql-idp/values-idp-full.yaml \
  --namespace clawql --create-namespace \
  --set clawql-mcp.envFromSecret=clawql-provider-env
```

**Resource floor (full profile):** single node with **≥ 12 GiB RAM** when Onyx vector stack is on; **8 GiB** minimum with `onyx.enabled: false`.

## Profiles

| Values file            | Profile                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `values.yaml`          | Lean — MCP + memory/documents only                                                      |
| `values-idp-full.yaml` | Full IDP lab — pipeline, OpenClaw, dashboard, workflow/argocd hooks, NATS, Ouroboros PG |

## BYO components (not bundled)

- **Argo Workflows** controller — [`deployment/argo-workflows/README.md`](../../deployment/argo-workflows/README.md)
- **Argo CD** — install separately; enable `clawql-mcp.enableArgoCd` for MCP `argocd` tool RBAC
- **Langfuse** — [`docs/observability/langfuse-values.example.yaml`](../../docs/observability/langfuse-values.example.yaml)
- **Label Studio** — HITL via `CLAWQL_ENABLE_HITL_LABEL_STUDIO` + external LS URL

Operator guide: [`docs/deployment/clawql-idp-helm.md`](../../docs/deployment/clawql-idp-helm.md).

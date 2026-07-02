# GitOps manifests for ClawQL IDP

**Tracking:** [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)

Sample **Argo CD Application** manifests for deploying the IDP stack from Git. ClawQL does not install Argo CD — apply these after Argo CD is running in your cluster.

## Repository layout (recommended)

```
workflows-gitops/
  applications/
    clawql-idp-dev.yaml      # dev cluster — umbrella or lean chart
    clawql-idp-staging.yaml
  workflow-templates/
    clawql-vault-daily-digest.yaml   # copied from deployment/argo-workflows/templates/
  projects/
    clawql-idp.yaml          # AppProject with destination namespace allowlist
```

## Install order

1. Install **Argo CD** (upstream Helm chart)
2. Create **AppProject** with allowed repos and namespaces
3. Apply **Application** manifests from `applications/`
4. Enable ClawQL MCP tools: `CLAWQL_ENABLE_WORKFLOW=1`, `CLAWQL_ENABLE_ARGO_CD=1`

## ClawQL chart sources

| Target | Helm chart | Values |
| ------ | ---------- | ------ |
| Lean MCP | `charts/clawql-mcp` | `values.yaml` or env-specific overlay |
| Full IDP | `charts/clawql-idp` | `values-idp-full.yaml` |

Point Argo CD `source.repoURL` at this GitHub repo (or your fork) and set `targetRevision` to a release tag (e.g. `v6.4.0`).

## Agent promotion path

When **ClawQL-Agent** opens a PR changing `workflow-templates/`, the human reviewer merges → Argo CD syncs → `workflow` tool can submit against the updated `WorkflowTemplate`.

Full threat model: [`docs/gitops/agent-pr-argocd-pipeline.md`](../../docs/gitops/agent-pr-argocd-pipeline.md).

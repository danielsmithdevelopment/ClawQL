# ClawQL GitOps (Argo CD)

**Tracking:** [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)  
**Live bootstrap:** [`docs/deployment/hosted-live-bootstrap.md`](../../docs/deployment/hosted-live-bootstrap.md)  
**Infra:** Pulumi profiles in [`infra/pulumi`](../pulumi) (`edge` · `idp-k3s` · `eks`)

Sample **Argo CD** manifests for deploying the IDP stack and `.cqw` WorkflowTemplates from Git. ClawQL does not install Argo CD — apply these after Argo CD is running (K3s or EKS from Pulumi).

## Layout

```
infra/gitops/
  projects/clawql.yaml           # AppProject allowlists
  applications/
    root.yaml                    # app-of-apps
    clawql-idp-dev.yaml          # manifests/charts/clawql-idp
    clawql-workflows.yaml        # workflows/*.cqw
    clawql-karpenter.yaml        # Karpenter NodePools (EKS)
  karpenter/
    nodepools.yaml               # reserved + spot pools (placeholders)
  workflows/                    # .cqw packs (synced by clawql-workflows)
  argo-workflows/               # lab YAML WorkflowTemplates
```

## Install order

1. **Pulumi** — provision `idp-k3s` or `eks` (and `edge` for Developer/Teams)
2. Install **Argo CD** (upstream Helm chart) into `argocd`
3. `kubectl apply -f infra/gitops/projects/clawql.yaml -n argocd`
4. `kubectl apply -f infra/gitops/applications/root.yaml -n argocd`
5. Sync children: **clawql-idp-dev**, **clawql-workflows** (+ **clawql-karpenter-config** on EKS)
6. Enable ClawQL MCP: `CLAWQL_ENABLE_WORKFLOW=1`, `CLAWQL_ENABLE_ARGO_CD=1`

## Why Argo CD unlocks Workflows

| Concern                 | Mechanism                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Desired cluster state   | Argo CD Applications → Helm + directories                                           |
| Deterministic pipelines | `.cqw` → WorkflowTemplate CRs → Argo Workflows                                      |
| Agent safety            | MCP `workflow` is **template-ref only**; promotion is PR → sync (#258)              |
| Spot / reserved pools   | Karpenter NodePools labeled `clawql.dev/pool`; `.cqw` sets nodeSelector/tolerations |

## ClawQL chart sources

| Target   | Helm chart          | Values                                |
| -------- | ------------------- | ------------------------------------- |
| Lean MCP | `manifests/charts/clawql-mcp` | `values.yaml` or env-specific overlay |
| Full IDP | `manifests/charts/clawql-idp` | `values-idp-full.yaml`                |

Point Argo CD `source.repoURL` at this GitHub repo (or your fork) and set `targetRevision` to a release tag (e.g. `v7.2.0`) for production.

## Agent promotion path

When an agent opens a PR changing `infra/gitops/workflows/*.cqw`, the human reviewer merges → Argo CD syncs → `workflow` tool can submit against the updated `WorkflowTemplate`.

Full threat model: [`docs/gitops/agent-pr-argocd-pipeline.md`](../../docs/gitops/agent-pr-argocd-pipeline.md).

# ClawQL Workflow packs (`.cqw`)

Kinetic-annotated **Argo WorkflowTemplates**. Synced to the cluster by Argo CD Application
[`clawql-workflows`](../gitops/applications/clawql-workflows.yaml).

## How this fits live ops

```
.cqw in Git  →  Argo CD sync  →  WorkflowTemplate CR  →  MCP `workflow` submit
                                              ↓
                                    Argo Workflows executes DAG
```

Deterministic pipelines (IDP hops, vault digest, fair-queue OCR) belong here — not in
ad-hoc agent loops. Ouroboros / agents **submit** these templates; they do not invent
inline Workflow specs (v1 is template-ref only).

## Spec

- Format: [`docs/specs/cq-extensions/cqw.md`](../../docs/specs/cq-extensions/cqw.md)
- ADR: [0010](../../docs/adr/0010-cq-file-extensions.md) · [0004](../../docs/adr/0004-argo-cd-workflows-clawql-pipelines.md)
- GitOps promotion: [`docs/gitops/agent-pr-argocd-pipeline.md`](../../docs/gitops/agent-pr-argocd-pipeline.md)

## Packs

| File | Purpose |
| --- | --- |
| `vault-daily-digest.cqw` | Daily vault digest over Obsidian PVC |
| `idp-document-pipeline.cqw` | Smoke / batch IDP: inspect → classify → extract (MCP via curl to clawql-mcp) |

Plain YAML without kinetic annotations can stay under `deployment/argo-workflows/templates/`
for lab smoke; **prefer `.cqw` for anything GitOps-managed**.

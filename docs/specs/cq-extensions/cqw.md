# `.cqw` — ClawQL Workflow (draft)

**Extension:** `.cqw`  
**Media type (proposed):** `application/vnd.clawql.workflow+yaml`  
**Status:** Draft v0.1 · [ADR 0010](../../adr/0010-cq-file-extensions.md) · Related: [ADR 0004](../../adr/0004-argo-cd-workflows-clawql-pipelines.md)

## Purpose

Kubernetes / Argo Workflow templates that include **ClawQL kinetic governance** annotations. Plain Argo YAML without kinetic metadata should remain `.yaml`.

## Serialization

YAML compatible with Argo `Workflow` / `WorkflowTemplate`, plus ClawQL annotation block.

## Required ClawQL annotations

Under `metadata.annotations` (or a top-level `clawql:` extension object — choose one in v1 tooling; prefer annotations for Argo compatibility):

| Key | Notes |
| --- | ----- |
| `clawql.dev/kinetic` | `true` when the workflow performs side effects |
| `clawql.dev/risk-level` | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `clawql.dev/blast-radius` | e.g. `SINGLE_RECORD`, `BULK`, `INFRA` |
| `clawql.dev/rollback-protocol` | e.g. `WORKFLOW_CANCEL`, `REVERSAL` |
| `clawql.dev/executor` | `ARGO_WORKFLOW` (default for `.cqw`) |

Recommended:

| Key | Notes |
| --- | ----- |
| `clawql.dev/requires-mandate` | `true` / `false` |
| `clawql.dev/mandate-type` | AP2 type when required |
| `clawql.dev/correlation-id-param` | Workflow param name carrying WORM correlation |

## Tooling hooks

- Transaction Sandbox / PEP — detect `.cqw` and enforce kinetic path
- `clawql ontology` / future `clawql workflow lint` — require kinetic keys when `clawql.dev/kinetic=true`
- Keep submitting via existing `workflow` MCP tool (template-only)

## Non-goals

- Replacing Argo CRDs
- Inventing a new DAG language — Argo remains the execution plane

## Example (illustrative)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: clawql-idp-pipeline
  annotations:
    clawql.dev/kinetic: "true"
    clawql.dev/risk-level: "LOW"
    clawql.dev/blast-radius: "SINGLE_RECORD"
    clawql.dev/rollback-protocol: "WORKFLOW_CANCEL"
    clawql.dev/executor: "ARGO_WORKFLOW"
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks: []
```

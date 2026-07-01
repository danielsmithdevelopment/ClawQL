# Argo Workflows templates for ClawQL automation

Optional **bring-your-own Argo Workflows** (≥ **3.4.0**) manifests. ClawQL does not install Argo as a required chart dependency.

## Prerequisites

- Argo Workflows controller running in the cluster
- ClawQL MCP deployed with vault memory enabled (`CLAWQL_OBSIDIAN_VAULT_PATH` writable — e.g. Helm `vault.hostPath` or PVC)
- MCP **`workflow`** tool enabled on the operator workstation or in-cluster agent: `CLAWQL_ENABLE_WORKFLOW=1`, `CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`
- ServiceAccount with permission to create `Workflow` resources and read `WorkflowTemplate` in the target namespace (or enable **`enableWorkflow: true`** + **`workflow.rbac: true`** on the ClawQL Helm chart — see [`docs/mcp/workflow-tool.md`](../../docs/mcp/workflow-tool.md))

Apply templates into an allowlisted namespace (example `clawql`):

```bash
kubectl create namespace clawql --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deployment/argo-workflows/templates/ -n clawql
```

## `clawql-vault-daily-digest`

**WorkflowTemplate** that runs the vault digest runner: collects every `memory_ingest` note under `Memory/` from the last **24 hours** (by `clawql_ingest_created` frontmatter or file mtime), builds a single rollup note, and **`memory_ingest`s** it with tag **`clawql-digest`**.

### Submit via MCP `workflow` tool

```json
{
  "operation": "submit",
  "namespace": "clawql",
  "template_ref": {
    "kind": "WorkflowTemplate",
    "name": "clawql-vault-daily-digest",
    "namespace": "clawql"
  },
  "parameters": {
    "hours_back": "24"
  },
  "correlation_id": "nightly-vault-digest"
}
```

### Schedule (optional CronWorkflow)

Uncomment the `CronWorkflow` section in `clawql-vault-daily-digest.yaml` or create a separate manifest. Default schedule: `0 6 * * *` (06:00 UTC daily).

### Container image

The template defaults to `ghcr.io/danielsmithdevelopment/clawql-mcp:latest`. Override `workflowDefaults` or the template parameter `clawql_image` to pin your registry digest.

### RBAC reference

See [`docs/design/workflow-tool-argo.md`](../../docs/design/workflow-tool-argo.md) for minimum Role verbs. The digest step only needs vault read/write inside the pod (no Kubernetes API from the script).

## Related

- [Design: workflow MCP tool](../../docs/design/workflow-tool-argo.md)
- [ADR 0004](../../docs/adr/0004-argo-cd-workflows-clawql-pipelines.md)

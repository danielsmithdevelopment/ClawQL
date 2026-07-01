# `argocd` MCP tool (optional)

**Enable:** `CLAWQL_ENABLE_ARGO_CD=1`  
**Design:** [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md), [`workflow-tool-argo.md`](../design/workflow-tool-argo.md)  
**Related:** [`workflow` tool](workflow-tool.md) for Argo Workflows DAG execution

Observe and optionally sync **Argo CD `Application`** resources via the Kubernetes CRD API (no Argo CD Server HTTP dependency for read; sync uses the Application `operation` field).

## Required configuration

| Variable                             | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `CLAWQL_ENABLE_ARGO_CD`              | Register the tool                          |
| `CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST` | Comma-separated namespaces (e.g. `argocd`) |
| `CLAWQL_ARGO_CD_DEFAULT_NAMESPACE`   | Default when caller omits `namespace`      |

Optional: `CLAWQL_ARGO_CD_KUBECONFIG` (dev; falls back to `CLAWQL_WORKFLOW_KUBECONFIG`), `CLAWQL_ARGO_CD_ALLOW_SYNC=1` for the **`sync`** operation.

## Helm

```yaml
enableArgoCd: true
argocd:
  namespaceAllowlist:
    - argocd
  defaultNamespace: argocd
  rbac: true
  allowSync: false # set true + CLAWQL_ARGO_CD_ALLOW_SYNC for sync
```

## Operations

| `operation` | Purpose                                                |
| ----------- | ------------------------------------------------------ |
| `list`      | List Applications (optional `label_selector`, `limit`) |
| `get`       | Sync/health summary for one Application                |
| `sync`      | Request sync when `CLAWQL_ARGO_CD_ALLOW_SYNC=1`        |

## Example

```json
{
  "operation": "get",
  "namespace": "argocd",
  "name": "guestbook"
}
```

Response includes `sync_status`, `health_status`, `revision`, and condensed `source` (repo URL, path, target revision).

## Related

- [Argo Workflows operator guide](workflow-tool.md)
- [deployment/argo-workflows/README.md](../../deployment/argo-workflows/README.md)

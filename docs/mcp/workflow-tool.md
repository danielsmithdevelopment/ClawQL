# `workflow` MCP tool (optional)

**Enable:** `CLAWQL_ENABLE_WORKFLOW=1`  
**Design:** [`docs/design/workflow-tool-argo.md`](../design/workflow-tool-argo.md)  
**Argo minimum:** Workflows **≥ 3.4.0**

Template-ref **`submit`** only in v1 — agents start reviewed **`WorkflowTemplate`** / **`ClusterWorkflowTemplate`** runs and observe status without raw CRD editing.

## Required configuration

| Variable                              | Purpose                               |
| ------------------------------------- | ------------------------------------- |
| `CLAWQL_ENABLE_WORKFLOW`              | Register the tool                     |
| `CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST` | Comma-separated namespaces (required) |
| `CLAWQL_WORKFLOW_DEFAULT_NAMESPACE`   | Default namespace when omitted        |

Optional: `CLAWQL_WORKFLOW_KUBECONFIG` (dev), `CLAWQL_WORKFLOW_TEMPLATE_ALLOWLIST`, `CLAWQL_WORKFLOW_ARGO_UI_BASE_URL`, `CLAWQL_WORKFLOW_ALLOW_DELETE=1`, `CLAWQL_WORKFLOW_WAIT_TIMEOUT_SECONDS` (default `600`), `CLAWQL_WORKFLOW_WAIT_POLL_SECONDS` (default `5`).

## Operations

| `operation`      | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `submit`         | Create `Workflow` from `template_ref` + `parameters`                    |
| `get`            | Phase, condensed node summary                                           |
| `wait`           | Poll until terminal phase (`Succeeded` / `Failed` / `Error`) or timeout |
| `list`           | List workflows (label / phase filters)                                  |
| `list_templates` | Catalog templates in namespace                                          |
| `logs`           | Bounded pod log excerpt                                                 |
| `delete`         | When `CLAWQL_WORKFLOW_ALLOW_DELETE=1`                                   |

## Example: vault daily digest

Apply [`deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml`](../../deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml), then:

```json
{
  "operation": "submit",
  "namespace": "clawql",
  "template_ref": {
    "kind": "WorkflowTemplate",
    "name": "clawql-vault-daily-digest",
    "namespace": "clawql"
  },
  "parameters": { "hours_back": "24" },
  "correlation_id": "vault-digest-nightly"
}
```

After `submit`, use **`wait`** instead of manually polling `get`:

```json
{
  "operation": "wait",
  "namespace": "clawql",
  "name": "clawql-vault-daily-digest-abc12",
  "timeout_seconds": 600,
  "poll_interval_seconds": 5,
  "include_nodes": false
}
```

Response includes `workflow`, `waited_seconds`, `timed_out`, and `polls`. `ok` is `false` when the timeout elapses before a terminal phase.

**Local (no Argo):** `npm run workflow:vault-digest` with `CLAWQL_OBSIDIAN_VAULT_PATH` set.

The digest collects `memory_ingest` notes under `Memory/` from the last 24 hours and ingests one rollup note titled `Vault digest — YYYY-MM-DD`.

## Related

- [Argo templates README](../../deployment/argo-workflows/README.md)
- [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md)

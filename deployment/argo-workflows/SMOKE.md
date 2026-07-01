# Smoke test: vault daily digest via `workflow` MCP tool

End-to-end check that ClawQL can **submit** an Argo workflow from the vault digest template, **wait** for completion, and produce a rollup note in the Obsidian vault.

**Prerequisites:** Argo Workflows ≥ 3.4.0, ClawQL MCP with memory + workflow enabled, Slack optional.

## 1. Enable workflow (Helm)

```yaml
enableMemory: true
enableWorkflow: true
workflow:
  namespaceAllowlist:
    - clawql
  defaultNamespace: clawql
  rbac: true
  # Optional: Slack when wait finishes (requires CLAWQL_SLACK_TOKEN)
  notifyOnTerminal: true
  notifyChannel: C01234567
```

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace -f your-values.yaml
```

## 2. Apply Argo template

```bash
kubectl create namespace clawql --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml -n clawql
```

Confirm the MCP ServiceAccount can create workflows (chart `workflow.rbac: true` creates Role + RoleBinding).

## 3. Seed vault (optional)

Ingest a test note so the digest has material:

```json
{
  "tool": "memory_ingest",
  "arguments": {
    "title": "Smoke test note",
    "insights": "Workflow digest smoke test content.",
    "tags": ["smoke"]
  }
}
```

## 4. Submit workflow

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
  "correlation_id": "workflow-smoke-digest"
}
```

Record the returned `workflow.name` (e.g. `clawql-vault-daily-digest-xxxxx`).

## 5. Wait for terminal phase

```json
{
  "operation": "wait",
  "namespace": "clawql",
  "name": "clawql-vault-daily-digest-xxxxx",
  "timeout_seconds": 600,
  "poll_interval_seconds": 5
}
```

Expect `ok: true`, `timed_out: false`, `workflow.phase: "Succeeded"`.

## 6. Verify

- **Vault:** a note titled `Vault digest — YYYY-MM-DD` under `Memory/` with tag `clawql-digest`.
- **Audit:** `audit` `list` includes `category: workflow`, `action: submit` and `terminal`.
- **Slack** (if `CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL=1`): channel message with `Workflow SUCCEEDED`.
- **Argo UI** (if `CLAWQL_WORKFLOW_ARGO_UI_BASE_URL` set): open `workflow.links.argo_ui` from the wait response.

## Local fallback (no Argo)

```bash
export CLAWQL_OBSIDIAN_VAULT_PATH=/path/to/vault
npm run workflow:vault-digest
```

Same digest logic as the Argo template step; use this when validating runner changes without a cluster.

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| `workflow tool is not enabled` | `CLAWQL_ENABLE_WORKFLOW=1` |
| `namespace is not in allowlist` | `CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST` includes target ns |
| RBAC forbidden on submit | RoleBinding for MCP SA in workflow namespace |
| `wait` times out | `kubectl get workflow -n clawql`; pod logs via `workflow` `logs` |
| Empty digest | Notes under `Memory/` within `hours_back` window |

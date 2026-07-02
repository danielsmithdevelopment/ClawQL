# Lending W-2 reference pack ([#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253))

End-to-end **intelligent document processing** sample for mortgage / lending underwriting: ingest a W-2, parse with Docling, classify with confidence routing, **human-in-the-loop** review on low confidence, then resume the Argo workflow.

**Synthetic data only** — fixtures contain no real SSNs, EINs, or taxpayer PII.

## Contents

| File | Purpose |
| ---- | ------- |
| [`workflow-template.yaml`](workflow-template.yaml) | Argo `WorkflowTemplate` — parse → classify → suspend → finalize |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio labeling UI for W-2 field validation |
| [`openclaw-prompt.md`](openclaw-prompt.md) | OpenClaw system prompt addendum + tool sequence |
| [`fixtures/synthetic-w2.txt`](fixtures/synthetic-w2.txt) | Demo W-2 text (upload or base64 to Docling) |

## Prerequisites

- ClawQL MCP with **`CLAWQL_ENABLE_WORKFLOW=1`**, **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**, documents on (default)
- **`DOCLING_BASE_URL`** pointing at Docling Serve
- Label Studio project created from `label-studio-config.xml`
- Argo Workflows ≥ 3.4.0 in namespace allowlisted by **`CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`**

## 1. Apply the WorkflowTemplate

```bash
kubectl apply -f deployment/samples/lending-w2/workflow-template.yaml -n clawql
```

## 2. Submit the workflow

```json
{
  "operation": "submit",
  "namespace": "clawql",
  "template_ref": {
    "kind": "WorkflowTemplate",
    "name": "clawql-lending-w2-ingest",
    "namespace": "clawql"
  },
  "parameters": {
    "document_path": "fixtures/synthetic-w2.txt",
    "confidence_threshold": "0.95"
  },
  "correlation_id": "lending-w2-demo-001"
}
```

The template runs a **classify** script (demo heuristic), then hits a **`suspend`** step when confidence is below threshold.

## 3. Parse with Docling (agent step)

Before or inside your production pipeline, convert the document:

```json
{
  "tool": "execute",
  "arguments": {
    "operationId": "docling::docling_convert_file",
    "fields": {
      "body": {
        "files": ["<base64 or multipart per your client>"]
      }
    }
  }
}
```

See [docling-onboarding.md](../../docs/providers/docling-onboarding.md).

## 4. HITL when suspended

When **`workflow` `get`** shows `suspended: true`:

```json
{
  "tool": "hitl_enqueue_label_studio",
  "arguments": {
    "project_id": 1,
    "confidence": 0.72,
    "correlation_id": "lending-w2-demo-001",
    "workflow_ref": {
      "namespace": "clawql",
      "name": "<workflow-name-from-submit>",
      "node_field_selector": "displayName=hitl-review"
    },
    "tasks": [
      {
        "data": {
          "text": "Review W-2 fields — synthetic demo",
          "employer_name": "ACME LENDING DEMO INC",
          "wages": "85000.00",
          "federal_withheld": "12000.00",
          "parsed_markdown": "…"
        }
      }
    ]
  }
}
```

Set **`CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1`** on ClawQL HTTP so Label Studio webhook auto-calls **`workflow` `resume`**.

## 5. After resume

The template **`finalize`** step writes a JSON summary artifact. Fetch with:

```json
{
  "operation": "artifacts",
  "namespace": "clawql",
  "name": "<workflow-name>"
}
```

Persist outcomes with **`memory_ingest`** for underwriting audit trails.

## Label Studio setup

1. Create project → paste **`label-studio-config.xml`** as labeling setup.
2. Configure webhook → `https://<clawql-host>/hitl/label-studio/webhook` with **`CLAWQL_HITL_WEBHOOK_TOKEN`**.
3. Note **`project_id`** for enqueue calls.

## OpenClaw

Use [`openclaw-prompt.md`](openclaw-prompt.md) as a system prompt addendum. Full IDP defaults: [openclaw-idp-skill-profile.md](../../docs/openclaw/openclaw-idp-skill-profile.md).

## Related

- [Argo workflows README](../../deployment/argo-workflows/README.md)
- [HITL Label Studio](../../docs/mcp/hitl-label-studio.md)
- [Multi-reviewer RBAC (CE two-person pattern)](../../docs/mcp/hitl-label-studio.md#14-multi-reviewer-rbac-ce-vs-enterprise) ([#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249))
- [Fine-tuned classifier runbook](../../docs/runbooks/fine-tuned-classifier.md)
- [workflow MCP tool](../../docs/mcp/workflow-tool.md)

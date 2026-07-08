# Real estate title commitment reference pack

End-to-end **intelligent document processing** sample for residential transaction coordinators and KW agents: ingest a title commitment, parse with Docling, classify Schedule B routing, **human-in-the-loop** review on low confidence or complex exceptions, then resume the Argo workflow and persist to vault memory.

ClawQL sits as the **intelligent document layer** alongside KW Command (CRM/pipeline), Google Drive (transaction folders), and Dotloop/DocuSign (e-sign) — it does not replace those systems.

**Synthetic data only** — fixtures contain no real property addresses tied to live transactions, no real title policy numbers, and no borrower PII.

## Contents

| File | Purpose |
| ---- | ------- |
| [`workflow-template.yaml`](workflow-template.yaml) | Argo `WorkflowTemplate` — classify → suspend → finalize |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio UI for Schedule B exception review |
| [`openclaw-prompt.md`](openclaw-prompt.md) | OpenClaw system prompt addendum + KW Command positioning |
| [`fixtures/synthetic-title-commitment.txt`](fixtures/synthetic-title-commitment.txt) | Demo title commitment (Schedule A + B) |

## Prerequisites

**Docker Compose (local POC):** reuse [`docker/compose/lending.compose.yml`](../../docker/compose/lending.compose.yml) — same Docling + classifier + LangExtract + Label Studio stack. Point fixtures at this pack's synthetic title commitment.

**Kubernetes / production-style:**

- ClawQL MCP with **`CLAWQL_ENABLE_WORKFLOW=1`**, **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**, documents on
- **`DOCLING_BASE_URL`**, Label Studio project from `label-studio-config.xml`
- Argo Workflows ≥ 3.4.0 in namespace allowlisted by **`CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`**

## 1. Apply the WorkflowTemplate

```bash
kubectl apply -f deployment/samples/real-estate-title/workflow-template.yaml -n clawql
```

## 2. Submit the workflow

```json
{
  "operation": "submit",
  "namespace": "clawql",
  "template_ref": {
    "kind": "WorkflowTemplate",
    "name": "clawql-realestate-title-ingest",
    "namespace": "clawql"
  },
  "parameters": {
    "document_path": "fixtures/synthetic-title-commitment.txt",
    "confidence_threshold": "0.90",
    "deal_id": "demo-deal-123-main"
  },
  "correlation_id": "realestate-title-demo-001"
}
```

## 3. Parse and classify (agent steps)

```json
{
  "tool": "classify_document",
  "arguments": {
    "docling_md": "<docling markdown from title commitment>",
    "min_confidence": 0.90
  }
}
```

Extract Schedule A/B fields:

```json
{
  "tool": "extract_document",
  "arguments": {
    "text": "<docling markdown>",
    "schema_preset": "title_commitment",
    "doc_id": "demo-deal-123-main-title"
  }
}
```

## 4. HITL when suspended

When **`workflow` `get`** shows `suspended: true`:

```json
{
  "tool": "hitl_enqueue_label_studio",
  "arguments": {
    "project_id": 1,
    "confidence": 0.82,
    "correlation_id": "realestate-title-demo-001",
    "workflow_ref": {
      "namespace": "clawql",
      "name": "<workflow-name-from-submit>",
      "node_field_selector": "displayName=hitl-review"
    },
    "tasks": [
      {
        "data": {
          "text": "Review Schedule B exceptions — synthetic demo",
          "property_address": "123 Main Street, Example City, EX 00000",
          "policy_amount": "485000.00",
          "schedule_b_exceptions": "1. Taxes 2026...\n3. Easement for utilities...",
          "parsed_markdown": "…"
        }
      }
    ]
  }
}
```

Set **`CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1`** for auto-resume after reviewer approval.

## 5. Vault threading

```json
{
  "tool": "memory_ingest",
  "arguments": {
    "title": "Title — demo-deal-123-main",
    "insights": [
      "Schedule B exception 3 (utility easement) flagged requires_curative — verify seller disclosure.",
      "Policy amount $485,000 matches PSA purchase price."
    ],
    "wikilinks": ["Deal demo-deal-123-main", "Property 123 Main Street"]
  }
}
```

Use **`memory_recall`** before the next session: "prior title exceptions on utility easements in Sunny Acres."

## Label Studio setup

1. Create project → paste **`label-studio-config.xml`** as labeling setup.
2. Webhook → `https://<clawql-host>/hitl/label-studio/webhook` with **`CLAWQL_HITL_WEBHOOK_TOKEN`**.

## Related

- [PSA reference pack](../real-estate-psa/README.md)
- [Lending W-2 pack](../lending-w2/README.md)
- [Real estate vertical overview](../../landing-page/demo/src/lib/industries/real-estate.ts) — industry page updates when workflows ship
- [HITL Label Studio](../../docs/mcp/hitl-label-studio.md)

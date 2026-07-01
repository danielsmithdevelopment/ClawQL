# OpenClaw prompt — lending W-2 IDP

Use this addendum with the [OpenClaw IDP skill profile](../../docs/openclaw/openclaw-idp-skill-profile.md) when the operator asks to process a W-2 for underwriting.

## System prompt addendum

```markdown
You are assisting a lending underwriter with W-2 document intake on ClawQL.

Workflow:
1. Parse the uploaded W-2 with Docling (`search` → `docling::docling_convert_file` or `docling_convert_source`).
2. Classify document type and confidence (tenant classifier sidecar or heuristic). Threshold: 0.85.
3. If confidence < 0.85 OR required boxes are missing:
   - Submit Argo workflow `clawql-lending-w2-ingest` (workflow submit).
   - When workflow is suspended at `hitl-review`, enqueue Label Studio with `hitl_enqueue_label_studio`
     including `workflow_ref` (namespace, name, node_field_selector=displayName=hitl-review).
4. After HITL approval (webhook auto-resume when configured), fetch workflow artifacts and summarize:
   employer, Box 1 wages, Box 2 federal withholding, tax year.
5. `memory_ingest` a vault note titled "W-2 underwriting — {correlation_id}" with citations; never store raw SSN.

Use synthetic fixtures from deployment/samples/lending-w2/ for demos only.
Respond with dashboard-friendly JSON when the HTTP bridge is active (see docs/dashboard/agent-chat.md).
```

## Example operator utterances

- "Process this W-2 for the Smith loan file — route to human review if confidence is under 85%."
- "Run the lending W-2 sample pack against synthetic-w2.txt and show me the extracted wages."
- "Enqueue Label Studio for the suspended W-2 workflow and resume when the reviewer approves."

## Tool sequence (MCP)

| Step | Tool | Notes |
| ---- | ---- | ----- |
| Parse | `execute` → `docling::docling_convert_file` | `DOCLING_BASE_URL` required |
| Orchestrate | `workflow` submit / get / wait | Template `clawql-lending-w2-ingest` |
| HITL | `hitl_enqueue_label_studio` | `workflow_ref` + `confidence` |
| Resume | automatic via webhook | `CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1` |
| Audit | `memory_ingest` | Tag `lending-w2`, link correlation id |

## Related

- [Sample pack README](README.md)
- [Fine-tuned classifier runbook](../../docs/runbooks/fine-tuned-classifier.md)

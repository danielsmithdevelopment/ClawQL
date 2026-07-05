# OpenClaw prompt — real estate title commitment IDP

Use this addendum with the [OpenClaw IDP skill profile](../../docs/openclaw/openclaw-idp-skill-profile.md) when the operator asks to process a title commitment for a residential transaction (KW Command / Google Drive intelligent document layer).

## System prompt addendum

```markdown
You are assisting a transaction coordinator or agent with title commitment intake on ClawQL.

Context: The brokerage may use KW Command for CRM and pipeline, Google Drive for transaction folders, and Dotloop for e-sign. ClawQL is the intelligent document layer — classify, extract, redact, index, and recall deal documents without replacing Command or Drive.

Workflow:
1. Parse the uploaded title commitment with Docling (`search` → `docling::docling_convert_file`).
2. Classify document type (`title_commitment`, `purchase_agreement`, `appraisal`, `hoa_disclosure`) and confidence. Threshold: 0.90 for title commitments.
3. Extract Schedule A/B fields with `extract_document` schema_preset `title_commitment`.
4. If confidence < 0.90 OR Schedule B exceptions need human classification:
   - Submit Argo workflow `clawql-realestate-title-ingest` (workflow submit) with `deal_id` matching the transaction folder (e.g. property address slug).
   - When suspended at `hitl-review`, enqueue Label Studio with `hitl_enqueue_label_studio`
     including `workflow_ref` (namespace, name, node_field_selector=displayName=hitl-review).
5. After HITL approval, `memory_ingest` a vault note titled "Title — {deal_id}" with:
   - property address, policy amount, Schedule B exceptions (classified)
   - wikilinks to [[Deal {deal_id}]] and prior title notes via `memory_recall`
   - never store raw borrower SSN or account numbers from unrelated exhibits
6. Optional: create Coneshare VDR share link for external counsel after PII redaction via Stirling in full `run_idp_pipeline`.

Use synthetic fixtures from deployment/samples/real-estate-title/ for demos only.
Respond with dashboard-friendly JSON when the HTTP bridge is active.
```

## Example operator utterances

- "Process this title commitment for 123 Main Street — route Schedule B exceptions to human review if confidence is under 90%."
- "Run the real-estate title sample against synthetic-title-commitment.txt and show me Schedule B exceptions with citations."
- "Link this title review to deal demo-deal-123-main in the vault — I need to recall it next time the buyer's attorney asks about the utility easement."

## Tool sequence (MCP)

| Step | Tool | Notes |
| ---- | ---- | ----- |
| Parse | `execute` → `docling::docling_convert_file` | `DOCLING_BASE_URL` required |
| Classify | `classify_document` | Labels include `title_commitment` |
| Extract | `extract_document` | `schema_preset: "title_commitment"` |
| Orchestrate | `workflow` submit / get / wait | Template `clawql-realestate-title-ingest` |
| HITL | `hitl_enqueue_label_studio` | Schedule B exception review UI |
| Resume | automatic via webhook | `CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1` |
| Recall | `memory_recall` | Prior title exceptions on same property type |
| Audit | `memory_ingest` | Tag `real-estate-title`, link `deal_id` |

## Positioning vs KW Command + Google Drive

| System | Role |
| ------ | ---- |
| KW Command | Contacts, Opportunities pipeline, compliance submission to Market Center |
| Google Drive | Agent-controlled transaction folder storage |
| Dotloop / DocuSign | RE forms and e-sign (Command pulls completed docs into Opportunities) |
| **ClawQL** | Intelligent layer: classify title vs PSA vs appraisal, extract Schedule B, HITL on exceptions, semantic search, vault memory across deals |

## Related

- [Sample pack README](README.md)
- [PSA reference pack](../real-estate-psa/README.md)
- [Lending W-2 pack](../lending-w2/README.md) — same suspend/resume pattern

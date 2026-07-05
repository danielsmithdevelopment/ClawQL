# Real estate vertical reference workflows

Shipped reference packs for ClawQL as the **intelligent document layer** in residential real estate — especially teams on **KW Command + Google Drive + Dotloop** who need classify, extract, HITL, semantic search, and vault memory without replacing their CRM.

| Pack | WorkflowTemplate | Primary document | HITL focus |
| ---- | ---------------- | ---------------- | ---------- |
| [real-estate-title](real-estate-title/README.md) | `clawql-realestate-title-ingest` | Title commitment | Schedule B exception classification |
| [real-estate-psa](real-estate-psa/README.md) | `clawql-realestate-psa-ingest` | Purchase agreement | Contract field confirmation |

## Architecture placement

```text
KW Command          → contacts, Opportunities pipeline, compliance to Market Center
Google Drive        → transaction folder storage (agent-controlled)
Dotloop / DocuSign  → RE forms + e-sign (Command pulls into Opportunities)
ClawQL              → parse, classify, extract, redact, index, recall, VDR share
```

ClawQL does **not** replace Command or Drive. It replaces the manual re-read loop: coordinators opening PDFs in Drive because Command and Drive don't share a semantic index.

## Local demo

Reuse the lending Compose stack (Docling + classifier + LangExtract + Label Studio):

```bash
cp docker/compose/lending.env.example docker/compose/lending.env
docker compose -f docker/compose/lending.compose.yml --env-file docker/compose/lending.env up -d --build
```

Bootstrap Label Studio with `real-estate-title/label-studio-config.xml` or `real-estate-psa/label-studio-config.xml`.

## Classifier and extractor presets

Horizontal MCP tools support real-estate labels and schema presets:

- **`classify_document`**: `title_commitment`, `purchase_agreement`, `appraisal`, `hoa_disclosure`
- **`extract_document`**: `schema_preset: "title_commitment"` | `"purchase_agreement"`

## Related

- [Lending W-2 pack](lending-w2/README.md) — same Argo suspend/resume + HITL pattern
- [Argo workflows README](../argo-workflows/README.md)
- [Fine-tuned classifier runbook](../../docs/runbooks/fine-tuned-classifier.md)

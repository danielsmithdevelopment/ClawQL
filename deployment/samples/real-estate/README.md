# Real estate vertical reference workflows

Shipped reference packs for ClawQL as the **intelligent document layer** in residential real estate — for brokerages on any CRM (Command, BoldTrail/kvCORE, Follow Up Boss, Compass, etc.) plus cloud storage and transaction tools, **and** for FSBO sellers comparing buyer offers alongside Houzeo or Beycome — who need classify, extract, HITL, semantic search, and vault memory without replacing their stack.

| Pack | WorkflowTemplate | Primary document | HITL focus |
| ---- | ---------------- | ---------------- | ---------- |
| [real-estate-title](real-estate-title/README.md) | `clawql-realestate-title-ingest` | Title commitment | Schedule B exception classification |
| [real-estate-psa](real-estate-psa/README.md) | `clawql-realestate-psa-ingest` | Purchase agreement | Contract field confirmation |
| [real-estate-fsbo](real-estate-fsbo/README.md) | — (agent-driven) | Buyer offer | Offer field / contingency confirmation |

## Architecture placement

```text
Brokerage CRM       → contacts, pipeline, compliance (varies by franchise)
Cloud storage       → transaction folders (Drive, Dropbox, SharePoint)
Transaction / e-sign → Dotloop, SkySlope, DocuSign, Paperless Pipeline
ClawQL              → parse, classify, extract, redact, index, recall, VDR share
```

ClawQL does **not** replace CRM or storage. It replaces the manual re-read loop: coordinators opening PDFs because no system shares a semantic index across the deal file.

## Local demo

Reuse the lending Compose stack (Docling + classifier + LangExtract + Label Studio):

```bash
cp docker/compose/lending.env.example docker/compose/lending.env
docker compose -f docker/compose/lending.compose.yml --env-file docker/compose/lending.env up -d --build
```

Bootstrap Label Studio with `real-estate-title/label-studio-config.xml` or `real-estate-psa/label-studio-config.xml`.

## Classifier and extractor presets

Horizontal MCP tools support real-estate labels and schema presets:

- **`classify_document`**: `title_commitment`, `purchase_agreement`, `buyer_offer`, `appraisal`, `hoa_disclosure`
- **`extract_document`**: `schema_preset: "title_commitment"` | `"purchase_agreement"` | `"buyer_offer"`

## Related

- [Lending W-2 pack](lending-w2/README.md) — same Argo suspend/resume + HITL pattern
- [Argo workflows README](../argo-workflows/README.md)
- [Fine-tuned classifier runbook](../../docs/runbooks/fine-tuned-classifier.md)

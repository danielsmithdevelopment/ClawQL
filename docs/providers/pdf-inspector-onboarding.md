# pdf-inspector (Firecrawl) — local PDF classify + Markdown

[Firecrawl pdf-inspector](https://github.com/firecrawl/pdf-inspector) is a **Rust-native** library (Node napi bindings via `@firecrawl/pdf-inspector`) that **classifies** PDFs as TextBased / Scanned / ImageBased / Mixed and extracts **position-aware Markdown** without OCR.

ClawQL exposes this as MCP **`inspect_pdf`** when **`CLAWQL_ENABLE_PDF_INSPECTOR=1`**. Use it **before Docling** so text-based PDFs skip expensive OCR.

## Default off

```bash
CLAWQL_ENABLE_PDF_INSPECTOR=1
# Optional allowlist for path= inputs (default: process cwd):
# CLAWQL_PDF_INSPECTOR_FILE_ROOTS=/vault:/fixtures
# Optional confidence floor for local_markdown routing (default 0.85):
# CLAWQL_PDF_INSPECTOR_LOCAL_MIN_CONFIDENCE=0.85
```

Requires the documents tier (`CLAWQL_ENABLE_DOCUMENTS` not `0`). No sidecar — the binding loads in-process inside `clawql-documents`.

## Happy path

```text
PDF bytes
  → inspect_pdf (detect|full)
  → route=local_markdown  → use markdown; skip Docling OCR
  → route=docling_ocr     → execute docling_convert_*
  → route=hybrid_docling  → Docling for OCR pages; local markdown may still help
  → classify_document → extract_document
```

```json
{
  "tool": "inspect_pdf",
  "arguments": {
    "path": "/fixtures/synthetic-w2.pdf",
    "mode": "full"
  }
}
```

Or pass **`base64`** instead of **`path`**. Response includes `pdf_type`, `confidence`, `pages_needing_ocr`, optional `markdown`, and **`route`** / **`route_reason`**.

## Modes

| Mode | Behavior |
| ---- | -------- |
| `detect` | Fast classify only (`classifyPdf`) |
| `full` (default) | Classify + Markdown (`processPdf`) when native text is available |

## Security

- **`path`** must resolve under **`CLAWQL_PDF_INSPECTOR_FILE_ROOTS`** (default: cwd realpath).
- Cap: **100 MiB** PDF.
- Prefer mounting vault/fixtures read-only rather than agent-supplied absolute paths outside the allowlist.

## Helm / Compose

- **In-process:** set chart **`enablePdfInspector: true`** (injects `CLAWQL_ENABLE_PDF_INSPECTOR=1`). No Deployment.
- **Docling / classifier / LangExtract sidecars:** `documentPipeline.docling|classifier|langextract.enabled` + `enableIdpClassifier` / `enableLangextract`.
- Docker Compose: [`docker/compose/docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml) and lending stack already wire Docling + classifier + LangExtract; add `CLAWQL_ENABLE_PDF_INSPECTOR=1` on the MCP service.

## Related

- [Docling onboarding](docling-onboarding.md)
- [LangExtract onboarding](langextract-onboarding.md)
- [IDP pipeline hub](idp-pipeline.md)
- Upstream: [firecrawl/pdf-inspector](https://github.com/firecrawl/pdf-inspector)

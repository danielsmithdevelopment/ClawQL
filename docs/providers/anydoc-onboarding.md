# anydoc (Firecrawl) — Office / PDF / CSV → GFM Markdown

[Firecrawl anydoc](https://github.com/firecrawl/anydoc) is a **Rust-native** library (Node napi bindings via `@firecrawl/anydoc`) that converts **DOCX, XLSX, PPTX, PDF, CSV**, and related formats to **GitHub-flavored Markdown** without OCR. Text PDFs use pdf-inspector under the hood.

ClawQL exposes this as MCP **`convert_document`** when **`CLAWQL_ENABLE_ANYDOC=1`**. Prefer it as the **default fast local convert** for native Office and text PDFs; use **Docling** when the response recommends OCR.

## Default off

```bash
CLAWQL_ENABLE_ANYDOC=1
# Optional allowlist for path= inputs (falls back to CLAWQL_PDF_INSPECTOR_FILE_ROOTS, then cwd):
# CLAWQL_ANYDOC_FILE_ROOTS=/vault:/fixtures
```

Requires the documents tier (`CLAWQL_ENABLE_DOCUMENTS` not `0`). No sidecar — the binding loads in-process inside `clawql-documents`.

## Happy path

```text
Office / PDF / CSV bytes
  → convert_document
  → route=local_markdown  → use markdown; skip Docling OCR
  → route=docling_ocr     → execute docling_convert_* (scanned / image PDF)
  → route=tika_fallback   → execute tika::* for metadata / last-resort text
  → classify_document → extract_document
```

```json
{
  "tool": "convert_document",
  "arguments": {
    "path": "/fixtures/offer-letter.docx",
    "format": "docx"
  }
}
```

Or pass **`base64`** instead of **`path`**. Response includes `format`, optional `markdown`, `processing_time_ms`, and **`route`** / **`route_reason`**.

## vs `inspect_pdf`

| Tool                 | Best for                                      |
| -------------------- | --------------------------------------------- |
| **`convert_document`** | Multi-format Office + CSV + text PDFs → GFM |
| **`inspect_pdf`**      | PDF-only classify (`pdf_type`, OCR pages) + Markdown |

Agents handling mixed loan packages (W-2 PDF + DOCX letters + XLSX schedules) should call **`convert_document`** first; use **`inspect_pdf`** when they need PDF-type diagnostics before routing.

## Response shape

| Field                 | Meaning                                              |
| --------------------- | ---------------------------------------------------- |
| `ok`                  | Conversion succeeded                                 |
| `provider`            | `anydoc`                                             |
| `format`              | Detected or hinted format (`docx`, `pdf`, …)         |
| `markdown`            | GFM body (omit with `include_markdown: false`)       |
| `processing_time_ms`  | Wall time for the convert                            |
| `route`               | `local_markdown` \| `docling_ocr` \| `tika_fallback` |
| `route_reason`        | Human-readable why that route was chosen             |
| `error`               | Present when `ok` is false                           |

## Security

- **`path`** must resolve under **`CLAWQL_ANYDOC_FILE_ROOTS`** (or **`CLAWQL_PDF_INSPECTOR_FILE_ROOTS`**, default: cwd realpath).
- Cap: **100 MiB** document.
- Prefer mounting vault/fixtures read-only rather than agent-supplied absolute paths outside the allowlist.

## Helm / Compose

- **In-process:** set chart **`enableAnydoc: true`** (injects `CLAWQL_ENABLE_ANYDOC=1`). No Deployment.
- **Docling / classifier / LangExtract sidecars:** `documentPipeline.docling|classifier|langextract.enabled` + `enableIdpClassifier` / `enableLangextract`.
- Docker Compose: lending stack enables **`CLAWQL_ENABLE_ANYDOC=1`** alongside pdf-inspector; Docling remains for OCR fallback.

## Related

- [pdf-inspector onboarding](pdf-inspector-onboarding.md)
- [Docling onboarding](docling-onboarding.md)
- [LangExtract onboarding](langextract-onboarding.md)
- [IDP pipeline hub](idp-pipeline.md)
- Upstream: [firecrawl/anydoc](https://github.com/firecrawl/anydoc)

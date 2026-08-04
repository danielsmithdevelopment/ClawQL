---
title: Documents & IDP
description: ingest_external_knowledge, optional Onyx search, inspect_pdf, and opt-in IDP pipeline tools. Default on; CLAWQL_ENABLE_DOCUMENTS=0 to omit.
slug: documents
status: default-on
package: clawql-documents
order: 4
prev: codegraph
next: bundled-providers
---

# Documents & IDP

**Plugin ID:** `clawql-documents`  
**Package:** `packages/clawql-documents` — `DocumentsPlugin`

Covers external knowledge import, enterprise search via Onyx, and optional intelligent document processing (IDP) MCP tools — including **pdf-inspector** routing, **Docling** layout OCR, **classify_document**, and **LangExtract** grounded extraction.

## MCP tools

| Tool                            | When registered                                                      |
| ------------------------------- | -------------------------------------------------------------------- |
| **`ingest_external_knowledge`** | Documents plugin on (default)                                        |
| **`knowledge_search_onyx`**     | Documents on + **`CLAWQL_ENABLE_ONYX=1`** + **`onyx`** in spec merge |
| **`run_idp_pipeline`**          | **`CLAWQL_ENABLE_IDP_PIPELINE=1`**                                   |
| **`inspect_pdf`**               | **`CLAWQL_ENABLE_PDF_INSPECTOR=1`**                                  |
| **`classify_document`**         | **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`**                                 |
| **`extract_document`**          | **`CLAWQL_ENABLE_LANGEXTRACT=1`**                                    |

Bundled IDP vendors (Tika, Gotenberg, Paperless, Stirling, Docling, Nextcloud, ConeShare) are loaded via **`execute`** when included in the spec merge — not separate plugins. **pdf-inspector** is in-process (no sidecar); Docling / classifier / LangExtract use HTTP services when configured.

## Recommended agent path

```text
PDF → inspect_pdf → local_markdown | Docling OCR → classify_document → extract_document → vault / HITL
```

| Hop        | Tool / execute             | Role                                                                    |
| ---------- | -------------------------- | ----------------------------------------------------------------------- |
| Route      | **`inspect_pdf`**          | Firecrawl pdf-inspector — TextBased → Markdown; Scanned/Mixed → Docling |
| Layout OCR | **`execute`** `docling::*` | Layout-aware parse for forms / W-2 / scanned pages                      |
| Doc type   | **`classify_document`**    | Label + confidence (HTTP classifier or local heuristic)                 |
| Fields     | **`extract_document`**     | LangExtract schema-grounded extractions + `char_interval`               |
| Multi-hop  | **`run_idp_pipeline`**     | Automated `DEFAULT_IDP_PIPELINE` (Nextcloud → … → Coneshare)            |

## Enable / disable

| Env                                  | Default | Effect                                                                                         |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| **`CLAWQL_ENABLE_DOCUMENTS=0`**      | on      | Omit `DocumentsPlugin` and document MCP tools; trims IDP vendors from **`all-providers`** only |
| **`CLAWQL_ENABLE_ONYX=1`**           | off     | Register **`knowledge_search_onyx`**                                                           |
| **`CLAWQL_EXTERNAL_INGEST=1`**       | off     | Allow URL fetch mode on **`ingest_external_knowledge`**                                        |
| **`CLAWQL_ENABLE_PDF_INSPECTOR=1`**  | off     | Register **`inspect_pdf`** (in-process `@firecrawl/pdf-inspector`)                             |
| **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`** | off     | Register **`classify_document`**                                                               |
| **`CLAWQL_ENABLE_LANGEXTRACT=1`**    | off     | Register **`extract_document`**                                                                |
| **`CLAWQL_ENABLE_IDP_PIPELINE=1`**   | off     | Register **`run_idp_pipeline`**                                                                |

### Service URLs (when sidecars are up)

| Env                                   | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| **`DOCLING_BASE_URL`**                | Docling Serve (layout OCR)                         |
| **`CLASSIFIER_BASE_URL`**             | Reference / fine-tuned classifier HTTP             |
| **`LANGEXTRACT_BASE_URL`**            | LangExtract sidecar (heuristic when unset)         |
| **`CLAWQL_PDF_INSPECTOR_FILE_ROOTS`** | Allowlist for `inspect_pdf` `path=` (default: cwd) |

Explicit **`CLAWQL_BUNDLED_PROVIDERS=paperless,tika,...`** can still list IDP vendor ids when **`CLAWQL_ENABLE_DOCUMENTS=0`**.

## Helm / Compose

- **Helm (`charts/clawql-mcp`):** `enablePdfInspector`, `enableIdpClassifier`, `enableLangextract`, `enableIdpPipeline`; opt-in **`documentPipeline.docling|classifier|langextract`**.
- **Compose:** [`docker/compose/lending.compose.yml`](../../docker/compose/lending.compose.yml) and [`docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml).

## Onyx note

**Onyx** is in the **default install provider stack** (spec merge) for rich search against large document bases. The **`knowledge_search_onyx`** MCP wrapper is still opt-in via **`CLAWQL_ENABLE_ONYX=1`**.

## Learn more

- [Document pipeline (learn)](/learn/document-pipeline)
- [IDP pipeline hub](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/idp-pipeline.md)
- [pdf-inspector onboarding](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/pdf-inspector-onboarding.md)
- [Docling onboarding](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/docling-onboarding.md)
- [LangExtract onboarding](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/langextract-onboarding.md)
- [Fine-tuned classifier runbook](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/runbooks/fine-tuned-classifier.md)
- [External ingest walkthrough](/learn/external-ingest-knowledge)
- [Onyx knowledge search](/learn/knowledge-search-onyx)

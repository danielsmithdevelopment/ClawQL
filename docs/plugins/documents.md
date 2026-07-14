---
title: Documents & IDP
description: ingest_external_knowledge, optional Onyx search, and opt-in IDP pipeline tools. Default on; CLAWQL_ENABLE_DOCUMENTS=0 to omit.
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

Covers external knowledge import, enterprise search via Onyx, and optional intelligent document processing (IDP) MCP tools.

## MCP tools

| Tool                            | When registered                                                      |
| ------------------------------- | -------------------------------------------------------------------- |
| **`ingest_external_knowledge`** | Documents plugin on (default)                                        |
| **`knowledge_search_onyx`**     | Documents on + **`CLAWQL_ENABLE_ONYX=1`** + **`onyx`** in spec merge |
| **`run_idp_pipeline`**          | **`CLAWQL_ENABLE_IDP_PIPELINE=1`**                                   |
| **`classify_document`**         | **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`**                                 |
| **`extract_document`**          | **`CLAWQL_ENABLE_LANGEXTRACT=1`**                                    |

Bundled IDP vendors (Tika, Gotenberg, Paperless, Stirling, Docling, Nextcloud, ConeShare) are loaded via **`execute`** when included in the spec merge — not separate plugins.

## Enable / disable

| Env                             | Default | Effect                                                                                         |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| **`CLAWQL_ENABLE_DOCUMENTS=0`** | on      | Omit `DocumentsPlugin` and document MCP tools; trims IDP vendors from **`all-providers`** only |
| **`CLAWQL_ENABLE_ONYX=1`**      | off     | Register **`knowledge_search_onyx`**                                                           |
| **`CLAWQL_EXTERNAL_INGEST=1`**  | off     | Allow URL fetch mode on **`ingest_external_knowledge`**                                        |

Explicit **`CLAWQL_BUNDLED_PROVIDERS=paperless,tika,...`** can still list IDP vendor ids when **`CLAWQL_ENABLE_DOCUMENTS=0`**.

## Onyx note

**Onyx** is in the **default install provider stack** (spec merge) for rich search against large document bases. The **`knowledge_search_onyx`** MCP wrapper is still opt-in via **`CLAWQL_ENABLE_ONYX=1`**.

## Learn more

- [External ingest walkthrough](/learn/external-ingest-knowledge)
- [Onyx knowledge search](/learn/knowledge-search-onyx)
- [Document pipeline](/learn/document-pipeline)
- [IDP pipeline (repo)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/providers/idp-pipeline.md)

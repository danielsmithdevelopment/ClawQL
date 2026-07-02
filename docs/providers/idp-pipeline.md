# IDP document pipeline (bundled providers)

ClawQL ships **eight bundled document vendors** for intelligent document processing (IDP). Agents compose them with **`search`** → **`execute`**; the dashboard chat bridge maps tool calls to IDP cards; Helm can co-deploy the services in-cluster.

**Canonical recipe:** `DEFAULT_IDP_PIPELINE` in **`packages/clawql-documents`** (`idp-pipeline.ts`) — Nextcloud intake → Docling (layout parse) or Tika → Gotenberg → Stirling → Paperless → Onyx → Nextcloud sync → Coneshare share/VDR.

**Related:** [IDP Platform vision](../vision/clawql-idp-platform.md) · [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md) · [Requirements matrix](../roadmap/idp-master-requirements-matrix.md) · [Agent chat contract](../dashboard/agent-chat.md) · [Helm](../../charts/clawql-mcp/README.md)

---

## Deployment models

ClawQL supports **self-hosted** (full data sovereignty via Helm) and **managed hosted** (tenant-isolated SaaS) deployments. Both run the same pipeline logic; the hosted plan uses the **ClawQL-native archive layer** (Nextcloud + Postgres metadata + Onyx) instead of Paperless-ngx (GPL-3.0). Self-hosted operators may still enable Paperless via Helm. See [IDP Platform § Deployment models](../vision/clawql-idp-platform.md#deployment-models) and [§ ClawQL Archive Layer](../vision/clawql-idp-platform.md#stage-4-clawql-archive-layer--storage-metadata-and-retrieval).

---

## Stack overview

```text
Nextcloud (inbox) → Docling (layout) / Tika → Gotenberg → Stirling → Paperless → Onyx → Nextcloud (processed) → Coneshare (VDR)
```

| Stage | Provider id | Role | Helm block |
| ----- | ----------- | ---- | ---------- |
| Intake / sync | **`nextcloud`** | WebDAV + OCS shares | `idpCollaboration.nextcloud` |
| Layout parse | **`docling`** | Layout-aware OCR + tables (forms, W-2) | `documentPipeline.docling` (opt-in; large CPU image) |
| Extract | **`tika`** | Text + metadata from 1,000+ formats | `documentPipeline.tika` |
| Normalize | **`gotenberg`** | Office/HTML → PDF | `documentPipeline.gotenberg` |
| Redact / fix PDF | **`stirling`** | PII redaction, split/merge | `documentPipeline.stirling` |
| Archive | **`paperless`** (self-hosted optional) or **ClawQL archive layer** (Nextcloud + Postgres + Onyx — default / hosted) | DMS or native archive | `documentPipeline.paperless` (optional) · `idpCollaboration.nextcloud` |
| Enterprise search | **`onyx`** | Hybrid search + ingestion API | `onyx.enabled` |
| Secure sharing | **`coneshare`** | VDR, share links, viewer webhook | `idpCollaboration.coneshare` |

All eight ids are in **`BUNDLED_DOCUMENT_VENDOR_IDS`** — included in default **`all-providers`** unless **`CLAWQL_ENABLE_DOCUMENTS=0`**.

---

## Environment (local / merged providers)

| Provider | Base URL | Auth env |
| -------- | -------- | -------- |
| `docling` | `DOCLING_BASE_URL` | Optional `DOCLING_API_KEY` → `X-Api-Key` |
| `tika` | `TIKA_BASE_URL` | Optional `CLAWQL_BEARER_TOKEN` |
| `gotenberg` | `GOTENBERG_BASE_URL` | Optional `CLAWQL_BEARER_TOKEN` |
| `stirling` | `STIRLING_BASE_URL` | `STIRLING_API_KEY` → `X-API-KEY` |
| `paperless` | `PAPERLESS_BASE_URL` | `PAPERLESS_API_TOKEN` → `Authorization: Token …` |
| `onyx` | `ONYX_BASE_URL` | `ONYX_API_TOKEN` → Bearer |
| `nextcloud` | `NEXTCLOUD_BASE_URL` | `NEXTCLOUD_USERNAME` + `NEXTCLOUD_APP_PASSWORD` (Basic + OCS) |
| `coneshare` | `CONESHARE_BASE_URL` | `CONESHARE_API_TOKEN` (Bearer); webhook: `CLAWQL_ENABLE_CONESHARE=1`, `CLAWQL_CONESHARE_WEBHOOK_TOKEN` |

See **`.env.example`** for localhost / in-cluster defaults aligned with **`values-docker-desktop.yaml`**.

---

## MCP tools beside raw execute

| Tool | When |
| ---- | ---- |
| **`ingest_external_knowledge`** | Bulk Markdown / URL → vault (documents feature on) |
| **`knowledge_search_onyx`** | Ergonomic Onyx search (`CLAWQL_ENABLE_ONYX=1`) |
| **`run_idp_pipeline`** | Automated **`DEFAULT_IDP_PIPELINE`** executor (`CLAWQL_ENABLE_IDP_PIPELINE=1`) |
| **`classify_document`** | POST to **`CLASSIFIER_BASE_URL`** or local heuristic (`CLAWQL_ENABLE_IDP_CLASSIFIER=1`) |
| **`extract_document`** | LangExtract grounded fields + HTML path refs (`CLAWQL_ENABLE_LANGEXTRACT=1`) |
| **`memory_ingest` / `memory_recall`** | Durable operator notes + citations |
| **`ouroboros_*`** | Spec-first multi-phase loops (optional) |
| **`hitl_enqueue_label_studio`** | Human review enqueue (optional) |

Automated multi-hop execution is available via MCP **`run_idp_pipeline`** when **`CLAWQL_ENABLE_IDP_PIPELINE=1`** ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)) — see **[idp-pipeline-runner.md](../mcp/idp-pipeline-runner.md)**. Background queue workers remain roadmap ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).

---

## Helm: enable the full stack

**Document pipeline** (Tika, Gotenberg, Stirling, Paperless + stores):

```yaml
documentPipeline:
  enabled: true
enableDocuments: true
```

**Onyx** (search wrapper + ingestion API):

```yaml
enableOnyx: true
onyx:
  enabled: true
```

**Nextcloud + Coneshare**:

```yaml
idpCollaboration:
  enabled: true
  nextcloud:
    enabled: true
    auth:
      adminUser: admin
      adminPassword: "<secret>"
  coneshare:
    enabled: false          # lab image is minimal
    externalUrl: ""         # or point at coneshare-compose
```

The MCP Deployment receives **`TIKA_BASE_URL`**, **`GOTENBERG_BASE_URL`**, **`STIRLING_BASE_URL`**, **`PAPERLESS_BASE_URL`**, **`ONYX_BASE_URL`**, **`NEXTCLOUD_BASE_URL`**, **`CONESHARE_BASE_URL`** when the corresponding subcharts are enabled. Chart-managed Secrets inject **`PAPERLESS_API_TOKEN`**, **`STIRLING_API_KEY`**, **`NEXTCLOUD_USERNAME`**, **`NEXTCLOUD_APP_PASSWORD`**, **`CONESHARE_API_TOKEN`** for **`execute`** auth.

**Docker Desktop:** **`make local-k8s-up`** uses **`values-docker-desktop.yaml`** — document pipeline + Onyx + Nextcloud on by default; Coneshare ingress is reserved for external URL wiring.

---

## Per-vendor onboarding

| Provider | Guide |
| -------- | ----- |
| Tika | [tika-onboarding.md](tika-onboarding.md) |
| Gotenberg | [gotenberg-onboarding.md](gotenberg-onboarding.md) |
| Stirling | [stirling-onboarding.md](stirling-onboarding.md) |
| Paperless | [paperless-onboarding.md](paperless-onboarding.md) |
| Onyx | [onyx-onboarding.md](onyx-onboarding.md) · [onyx-knowledge-tool.md](../mcp/onyx-knowledge-tool.md) |
| Nextcloud | [nextcloud-onboarding.md](nextcloud-onboarding.md) |
| Coneshare | [coneshare-onboarding.md](coneshare-onboarding.md) |
| LangExtract | [langextract-onboarding.md](langextract-onboarding.md) |

Refresh committed OpenAPI from live instances: **`npm run fetch-provider-specs`** ([`providers/README.md`](../../providers/README.md)).

---

## DEFAULT_IDP_PIPELINE operationIds

Reference sequence (agents fill paths/ids in **`args`**):

| Step | operationId |
| ---- | ----------- |
| Download inbox | `nextcloud::nextcloud_webdav_download` |
| Layout parse | `docling::docling_convert_source` |
| Extract | `tika::tika_parse_put` |
| Convert | `gotenberg::post_forms_libreoffice_convert` |
| Redact | `stirling::redactPdfAuto` |
| Archive | `paperless::documents_post_document_create` |
| Index | `onyx::upsert_ingestion_doc` |
| Upload processed | `nextcloud::nextcloud_webdav_upload` |
| Data room | `coneshare::coneshare_datarooms_create` |
| Share link | `coneshare::coneshare_share_links_create` |

Discover variants with **`search`** (e.g. manual Stirling redaction → `stirling::redactPdfManual`).

---

## Dashboard bridge

OpenClaw session tool audit (`clawql__execute`, `clawql__knowledge_search_onyx`, …) is enriched into **`steps`**, **`attachments`**, **`citations`**, **`pipelineStatus`** for Agent Chat. All seven vendor prefixes are mapped. See [agent-chat.md §8](../dashboard/agent-chat.md#8-bridge-enrichment-openclaw-session--rich-json).

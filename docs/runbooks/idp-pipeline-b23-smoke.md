# IDP pipeline smoke (B-2.3)

Proves **real IDP vendors in order** via Docker Compose (and optional external secrets).

OpenBench stub [`idp-safe-pipeline-lite`](../benchmarks/openbench-task-explanations.md#idp-safe-pipeline-lite) is only agent-tool sequencing — **not** this smoke.

**Compose file:** [`docker-compose.idp-smoke.yml`](../../examples/clawql-local-docker-compose/docker-compose.idp-smoke.yml)  
**ConeShare env:** [`coneshare-smoke.env`](../../examples/clawql-local-docker-compose/coneshare-smoke.env)  
**Ordered hops:** [`scripts/dev/smoke-idp-ordered-compose.sh`](../../scripts/dev/smoke-idp-ordered-compose.sh)  
**Wrapper:** [`scripts/dev/smoke-idp-pipeline-b23.sh`](../../scripts/dev/smoke-idp-pipeline-b23.sh)  
**Workflow:** [`.github/workflows/idp-pipeline-smoke.yml`](../../.github/workflows/idp-pipeline-smoke.yml)

---

## Ordered stages (DEFAULT_IDP_PIPELINE)

| #   | Stage              | In compose smoke? | Notes                                                                 |
| --- | ------------------ | ----------------- | --------------------------------------------------------------------- |
| 1   | Nextcloud download | **Yes**           | WebDAV inbox fixture                                                  |
| 2   | Docling            | Optional          | `IDP_SMOKE_INCLUDE_DOCLING=1` (~4 GiB) **or** `DOCLING_BASE_URL`      |
| 3   | Tika               | **Yes**           | text extract                                                          |
| 4   | Gotenberg          | **Yes**           | HTML→PDF                                                              |
| 5   | Stirling redact    | **Yes**           | auto-redact                                                           |
| 6   | Paperless archive  | **Yes**           | token upload                                                          |
| 7   | Onyx index         | **Yes**           | OpenSearch + indexing model → `POST /onyx-api/ingestion` (`18082`)    |
| 8   | Nextcloud upload   | **Yes**           | processed PDF                                                         |
| 9   | ConeShare VDR      | **Yes**           | open-source `conesharedev/coneshare` → token + dataroom (port `8999`) |

Compose proves hops **1,3,4,5,6,7,8,9** chained. Docling stays opt-in (image size).

---

## What each late stage actually calls

| Stage     | Operation                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- |
| Onyx      | Register/login → create API key → `POST /onyx-api/ingestion`                                 |
| ConeShare | `createsuperuser` → `POST /api/v1/token/` → `POST /api/v1/datarooms/` (+ share-link attempt) |

Onyx **cannot** exercise ingest in Lite / `DISABLE_VECTOR_DB=true` mode (`require_vector_db` gates `POST /onyx-api/ingestion`). Compose boots a **trimmed vector stack**: Postgres + Redis + OpenSearch (512 Mi heap) + one indexing model server + API (no Vespa, MinIO, Celery, or web UI). Before Onyx, the smoke stops Stirling/Paperless/Tika/Gotenberg to free GHA RAM; after upsert it tears Onyx down before ConeShare. Full hybrid RAG or Helm `fullVectorStack=true` is heavier than this smoke path (or use external `ONYX_*` secrets).

ConeShare follows [coneshare-compose](https://github.com/coneshare/coneshare-compose) (web + postgres + redis + celery).

---

## Optional overrides

| Env / secret                                 | Effect                               |
| -------------------------------------------- | ------------------------------------ |
| `IDP_SMOKE_INCLUDE_DOCLING=1`                | Boot Docling profile                 |
| `DOCLING_BASE_URL`                           | Use remote Docling                   |
| `ONYX_BASE_URL` + `ONYX_API_TOKEN`           | Skip compose Onyx; hit external      |
| `CONESHARE_BASE_URL` + `CONESHARE_API_TOKEN` | Skip compose ConeShare; hit external |
| `CLAWQL_HTTP_BASE` + webhook tokens          | `tier=live` NATS webhook dry_run     |

---

## Local

```bash
IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh
```

Artifacts: `artifacts/idp-b23-smoke/pipeline-smoke.json`, `summary.json`, `work/`.

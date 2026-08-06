# IDP pipeline smoke (B-2.3)

Proves **real IDP vendors in order** via Docker Compose (and optional external secrets).

OpenBench stub [`idp-safe-pipeline-lite`](../benchmarks/openbench-task-explanations.md#idp-safe-pipeline-lite) is only agent-tool sequencing — **not** this smoke.

**Compose file:** [`docker-compose.idp-smoke.yml`](../../examples/clawql-local-docker-compose/docker-compose.idp-smoke.yml)  
**Ordered hops:** [`scripts/dev/smoke-idp-ordered-compose.sh`](../../scripts/dev/smoke-idp-ordered-compose.sh)  
**Wrapper:** [`scripts/dev/smoke-idp-pipeline-b23.sh`](../../scripts/dev/smoke-idp-pipeline-b23.sh)  
**Workflow:** [`.github/workflows/idp-pipeline-smoke.yml`](../../.github/workflows/idp-pipeline-smoke.yml)

---

## Ordered stages (DEFAULT_IDP_PIPELINE)

| #   | Stage              | In compose smoke? | Needs                                                                         |
| --- | ------------------ | ----------------- | ----------------------------------------------------------------------------- |
| 1   | Nextcloud download | **Yes**           | bundled `nextcloud:29-apache`                                                 |
| 2   | Docling            | Optional          | `IDP_SMOKE_INCLUDE_DOCLING=1` (~4 GiB image) **or** secret `DOCLING_BASE_URL` |
| 3   | Tika               | **Yes**           | bundled                                                                       |
| 4   | Gotenberg          | **Yes**           | bundled (HTML→PDF)                                                            |
| 5   | Stirling redact    | **Yes**           | bundled `frooodle/s-pdf`                                                      |
| 6   | Paperless archive  | **Yes**           | bundled paperless-ngx + postgres/redis                                        |
| 7   | Onyx index         | **No (external)** | secrets `ONYX_BASE_URL` + `ONYX_API_TOKEN`                                    |
| 8   | Nextcloud upload   | **Yes**           | same Nextcloud                                                                |
| 9   | ConeShare VDR      | **No (external)** | secrets `CONESHARE_BASE_URL` + `CONESHARE_API_TOKEN`                          |

Compose proves hops **1,3,4,5,6,8** chained with a real PDF artifact. 2/7/9 are SKIP unless you provide the env/secrets above.

---

## Why some stages are not in compose

| Component                   | Why not default-compose                                           | How to include                                                                                         |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Docling**                 | CPU image ~4 GiB; slow pull/boot on GHA                           | `IDP_SMOKE_INCLUDE_DOCLING=1` or point `DOCLING_BASE_URL` at a running serve                           |
| **Onyx**                    | Multi-service (API + Vespa/Postgres/etc.), not a single container | Deploy Onyx separately; set `ONYX_BASE_URL` + `ONYX_API_TOKEN`                                         |
| **ConeShare**               | External/commercial product                                       | Set `CONESHARE_BASE_URL` + `CONESHARE_API_TOKEN`                                                       |
| **Live ClawQL HTTP / NATS** | Needs a deployed MCP + webhook tokens                             | `CLAWQL_HTTP_BASE` + `CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN` / `CLAWQL_CONESHARE_WEBHOOK_TOKEN` (tier=`live`) |
| **Argo Workflows**          | Cluster/kind optional CI                                          | `vars.CLAWQL_ENABLE_ARGO_WORKFLOWS_KIND_CI=1` (separate job)                                           |

---

## Local

```bash
# Full compose-able chain (recommended)
IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh

# Also boot Docling (large)
IDP_SMOKE_INCLUDE_DOCLING=1 IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh

# External Onyx / ConeShare / Docling when you have them
export ONYX_BASE_URL=… ONYX_API_TOKEN=…
export CONESHARE_BASE_URL=… CONESHARE_API_TOKEN=…
IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh
```

Artifacts: `artifacts/idp-b23-smoke/pipeline-smoke.json`, `summary.json`, `work/`.

---

## GitHub Actions secrets (optional upgrades)

| Secret                                       | Unlocks                                     |
| -------------------------------------------- | ------------------------------------------- |
| `DOCLING_BASE_URL`                           | stage_docling without pulling the big image |
| `ONYX_BASE_URL` + `ONYX_API_TOKEN`           | stage_onyx                                  |
| `CONESHARE_BASE_URL` + `CONESHARE_API_TOKEN` | stage_coneshare                             |
| `CLAWQL_HTTP_BASE` + webhook tokens          | tier=`live` NATS webhook dry_run            |

PR + weekly schedule always run **compose** (path-filtered).

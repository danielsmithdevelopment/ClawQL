# `run_idp_pipeline` (optional)

**Issue:** [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)

Automated multi-hop execution of **`DEFAULT_IDP_PIPELINE`** inside **`clawql-documents`**. The tool plans or runs each bundled **`execute`** hop in sequence with per-hop retries, optional Merkle snapshots, and an **`onPipelineHop`** lifecycle hook for audit or NATS.

**Related:** [IDP pipeline hub](../providers/idp-pipeline.md) · [MCP tools](mcp-tools.md) · [NATS worker](../deployment/nats-keda-worker.md) · [Plugin registry](../reference/clawql-plugin-registry.md)

---

## Enable

| Env                                      | Default | Effect                                                      |
| ---------------------------------------- | ------- | ----------------------------------------------------------- |
| **`CLAWQL_ENABLE_DOCUMENTS`**            | on      | Required — document stack + **`ingest_external_knowledge`** |
| **`CLAWQL_ENABLE_IDP_PIPELINE`**         | off     | Registers MCP **`run_idp_pipeline`**                        |
| **`CLAWQL_IDP_PIPELINE_MAX_RETRIES`**    | `2`     | Per-hop retries after execute failure                       |
| **`CLAWQL_IDP_PIPELINE_RETRY_DELAY_MS`** | `500`   | Backoff base (multiplied by attempt index)                  |
| **`CLAWQL_IDP_REDACT_LIST`**             | empty   | Stirling `listOfText` patterns (comma-separated)            |
| **`CLAWQL_IDP_REQUIRE_STIRLING_REDACT`** | off     | Fail if the Stirling redact hop is skipped                  |
| **`CLAWQL_MERKLE_ENABLED`**              | off     | When `1`, successful hops may include **`merkle_snapshot`** |

```bash
CLAWQL_ENABLE_DOCUMENTS=1
CLAWQL_ENABLE_IDP_PIPELINE=1
CLAWQL_IDP_REDACT_LIST='SSN|\d{3}-\d{2}-\d{4},EIN'
```

Helm: **`enableIdpPipeline=true`** (or `extraEnv`).

---

## Behavior

- **`dry_run`** defaults **`true`**: resolve args templates and return the hop plan without calling **`execute`**. Set **`dry_run: false`** to run the pipeline.
- **Pipeline:** defaults to **`DEFAULT_IDP_PIPELINE`** (Nextcloud → Tika → … → Stirling redact → … → Coneshare). Override with a custom **`pipeline`** array (advanced).
- **Artifact bag:** binary REST responses (`application/pdf`, images, octet-stream) are wrapped as `{ encoding: "base64", data, contentType }`. Successful hops update an in-memory **`pdf_base64`** bag so Stirling and the processed Nextcloud upload receive prior hop bytes.
- **Args:** each step uses **`argsTemplate`** from the recipe unless **`step_args[operationId]`** overrides. Templates support **`${document_path}`**, **`${processed_path}`**, **`${document_url}`**, **`${pdf_base64}`**, **`${redact_list}`**, **`${NEXTCLOUD_USERNAME}`**, **`${NEXTCLOUD_APP_PASSWORD}`**.
- **Inputs:** **`redact_list`**, **`processed_path`**, optional seed **`pdf_base64`**.
- **`skip_stages`:** omit hops by stage id (e.g. **`paperless`** when using the ClawQL archive layer).
- **`from_step` / `to_step`:** inclusive slice into the default recipe (0-based).
- **`stop_on_error`:** default **`true`** — halt after the first failed hop.

Response JSON includes **`hops[]`** (per-hop latency, attempts, excerpts with large base64 sanitized), **`dashboard_steps`**, **`completed_through`**, and **`halted_at_operation_id`** on failure.

---

## Background queue (NATS)

Synchronous MCP calls are fine for demos. Production intake uses **JetStream**:

```text
Nextcloud Flow / webhook
        │
        ▼
POST /idp/nextcloud/webhook  ──publish──►  clawql.document.inbox.arrived
                                                    │
                                                    ▼
                              nats worker (CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1)
                                                    │
                                                    ▼
                              run_idp_pipeline  (or POST /idp/pipeline/run)
```

See [nats-keda-worker.md](../deployment/nats-keda-worker.md) and [nextcloud-onboarding.md](../providers/nextcloud-onboarding.md).

**`onPipelineHop`** publishes **`clawql.document.pipeline.hop`** when NATS publish is enabled; terminal events use **`pipeline.completed`** / **`pipeline.failed`**.

---

## Example (dry run)

```json
{
  "dry_run": true,
  "document_path": "IDP/inbox/w2-sample.pdf",
  "redact_list": "SSN,EIN",
  "skip_stages": ["coneshare"]
}
```

## Example (execute)

```json
{
  "dry_run": false,
  "document_path": "IDP/inbox/w2-sample.pdf",
  "processed_path": "IDP/processed/w2-sample.pdf",
  "redact_list": "SSN|\\d{3}-\\d{2}-\\d{4}",
  "correlation_id": "batch-2026-06-30-001",
  "max_retries": 1
}
```

---

## Operator notes

- Vendor base URLs and tokens are the same as for raw **`execute`** — see [idp-pipeline.md § Environment](../providers/idp-pipeline.md#environment-local--merged-providers).
- Defense-in-depth: Stirling is the **document-stage** redact; Presidio / Privacy Filter remain **agent I/O** layers ([privacy-filter-local.md](../security/privacy-filter-local.md)).

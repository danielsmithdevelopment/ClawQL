# `run_idp_pipeline` (optional)

**Issue:** [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)

Automated multi-hop execution of **`DEFAULT_IDP_PIPELINE`** inside **`clawql-documents`**. The tool plans or runs each bundled **`execute`** hop in sequence with per-hop retries, optional Merkle snapshots, and an **`onPipelineHop`** lifecycle hook for audit or NATS.

**Related:** [IDP pipeline hub](../providers/idp-pipeline.md) · [MCP tools](mcp-tools.md) · [Plugin registry](../reference/clawql-plugin-registry.md)

---

## Enable

| Env | Default | Effect |
| --- | ------- | ------ |
| **`CLAWQL_ENABLE_DOCUMENTS`** | on | Required — document stack + **`ingest_external_knowledge`** |
| **`CLAWQL_ENABLE_IDP_PIPELINE`** | off | Registers MCP **`run_idp_pipeline`** |
| **`CLAWQL_IDP_PIPELINE_MAX_RETRIES`** | `2` | Per-hop retries after execute failure |
| **`CLAWQL_IDP_PIPELINE_RETRY_DELAY_MS`** | `500` | Backoff base (multiplied by attempt index) |
| **`CLAWQL_MERKLE_ENABLED`** | off | When `1`, successful hops may include **`merkle_snapshot`** |

```bash
CLAWQL_ENABLE_DOCUMENTS=1
CLAWQL_ENABLE_IDP_PIPELINE=1
```

Helm: set via **`extraEnv`** until a dedicated chart value is added.

---

## Behavior

- **`dry_run`** defaults **`true`**: resolve args templates and return the hop plan without calling **`execute`**. Set **`dry_run: false`** to run the pipeline.
- **Pipeline:** defaults to **`DEFAULT_IDP_PIPELINE`** (Nextcloud → Tika → … → Coneshare). Override with a custom **`pipeline`** array (advanced).
- **Args:** each step uses **`argsTemplate`** from the recipe unless **`step_args[operationId]`** overrides. Templates support **`${document_path}`**, **`${processed_path}`**, **`${NEXTCLOUD_USERNAME}`**, **`${NEXTCLOUD_APP_PASSWORD}`**.
- **`skip_stages`:** omit hops by stage id (e.g. **`paperless`** when using the ClawQL archive layer).
- **`from_step` / `to_step`:** inclusive slice into the default recipe (0-based).
- **`stop_on_error`:** default **`true`** — halt after the first failed hop.

Response JSON includes **`hops[]`** (per-hop latency, attempts, excerpts), **`dashboard_steps`** (done/active/pending labels), **`completed_through`**, and **`halted_at_operation_id`** on failure.

---

## Example (dry run)

```json
{
  "dry_run": true,
  "document_path": "IDP/inbox/w2-sample.pdf",
  "skip_stages": ["coneshare"]
}
```

## Example (execute)

```json
{
  "dry_run": false,
  "document_path": "IDP/inbox/w2-sample.pdf",
  "correlation_id": "batch-2026-06-30-001",
  "max_retries": 1
}
```

---

## Operator notes

- This tool is **synchronous** — long pipelines block the MCP call. For background queues, pair with Argo **`workflow`** or NATS consumers ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).
- Vendor base URLs and tokens are the same as for raw **`execute`** — see [idp-pipeline.md § Environment](../providers/idp-pipeline.md#environment-local--merged-providers).
- **`onPipelineHop`** is wired from **`configureDocumentsPluginDeps`** at startup (optional NATS **`clawql.document.*`** publish is a follow-up).

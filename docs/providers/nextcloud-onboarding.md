# Nextcloud (bundled provider)

Nextcloud is the IDP **human-accessible storage** layer. ClawQL exposes a curated WebDAV + OCS subset via the **`nextcloud`** bundled provider.

## Prerequisites

- Nextcloud instance reachable from the MCP server (Helm: `idpCollaboration.enabled=true`, or external URL).
- App password for the service account (Settings → Security → Devices & sessions → Create new app password).

## Environment

```bash
NEXTCLOUD_BASE_URL=http://nextcloud:8080
NEXTCLOUD_USERNAME=admin
NEXTCLOUD_APP_PASSWORD=your-app-password
```

ClawQL sends `Authorization: Basic …` and `OCS-APIRequest: true` on OCS routes.

## Discover operations

```json
{"tool":"search","arguments":{"query":"nextcloud webdav upload","limit":5}}
```

Common operationIds (merged mode):

| operationId | Purpose |
|-------------|---------|
| `nextcloud::nextcloud_webdav_download` | Download file from user files |
| `nextcloud::nextcloud_webdav_upload` | Upload processed output |
| `nextcloud::nextcloud_webdav_list` | PROPFIND folder listing |
| `nextcloud::nextcloud_shares_create` | Create share link via OCS |

## IDP pipeline

See **`packages/clawql-documents`** `DEFAULT_IDP_PIPELINE` — intake from `IDP/inbox/…`, output to `IDP/processed/…` (upload body is the chained PDF after Stirling). Full stack guide: [idp-pipeline.md](idp-pipeline.md) · [run_idp_pipeline](../mcp/idp-pipeline-runner.md).

## Background queue (NATS)

Configure Nextcloud Flow / an external script to POST when a file lands in `IDP/inbox/`:

```http
POST /idp/nextcloud/webhook
Authorization: Bearer <CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN>
Content-Type: application/json

{
  "document_path": "IDP/inbox/w2-sample.pdf",
  "processed_path": "IDP/processed/w2-sample.pdf",
  "redact_list": "SSN,EIN",
  "correlation_id": "nc-flow-001"
}
```

| Env | Purpose |
|-----|---------|
| `CLAWQL_ENABLE_NEXTCLOUD_WEBHOOK` | Force on/off (`1`/`0`); defaults on when `NEXTCLOUD_BASE_URL` is set |
| `CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN` | Required in production |
| `CLAWQL_NATS_ENABLE_PUBLISH=1` | Publish `clawql.document.inbox.arrived` |
| `CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1` | Worker runs `run_idp_pipeline` |

Helm: `nats.appIntegration.publish=true` + `nats.worker.enabled=true` + `nats.worker.idpPipeline=true`. See [nats-keda-worker.md](../deployment/nats-keda-worker.md).

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [NATS JetStream worker](../deployment/nats-keda-worker.md)
- [Bundled provider matrix](../../providers/README.md)

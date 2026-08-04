# ConeShare (bundled provider)

ConeShare adds **secure sharing, data rooms, and viewer analytics** on top of Nextcloud (or other storage). ClawQL ships a curated REST subset and an optional **webhook** for viewer events.

## Prerequisites

- ConeShare API reachable from MCP (`CONESHARE_BASE_URL` — site root, paths include `/api/v1/…`).
- JWT access token (`CONESHARE_API_TOKEN`) or credentials for `coneshare::coneshare_token_create`.

For production stacks, use [coneshare-compose](https://github.com/coneshare/coneshare-compose) or Helm `idpCollaboration.coneshare` (lab) / `coneshare.externalUrl` (external).

## Environment

```bash
CONESHARE_BASE_URL=http://coneshare:80
CONESHARE_API_TOKEN=eyJ…
CLAWQL_ENABLE_CONESHARE=1
CLAWQL_CONESHARE_WEBHOOK_TOKEN=shared-secret-for-automation-callbacks
```

## Webhook (viewer analytics → NATS follow-up)

Configure ConeShare automations to POST to the ClawQL MCP HTTP server:

```http
POST /idp/coneshare/webhook
Authorization: Bearer <CLAWQL_CONESHARE_WEBHOOK_TOKEN>
Content-Type: application/json

{
  "event_type": "viewer.opened",
  "share_link_id": "abc",
  "viewer_email": "analyst@example.com",
  "correlation_id": "share-batch-1",
  "clawql_share": { "workflow": { "namespace": "clawql", "name": "wf-vdr-review" } }
}
```

| Path | Behavior |
|------|----------|
| Vault / audit | Always — **`memory_ingest`** when enabled, else **`audit`** |
| NATS publish | `clawql.document.coneshare.viewer` when `CLAWQL_NATS_ENABLE_PUBLISH=1` |
| Sync resume | Optional `CLAWQL_CONESHARE_WEBHOOK_RESUME_WORKFLOW=1` + `clawql_share` |
| Async follow-up | Worker with `CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP=1` resumes Argo + optional Slack (`CLAWQL_CONESHARE_NOTIFY_CHANNEL`) |

Helm: `nats.worker.coneshareFollowup=true`. See [nats-keda-worker.md](../deployment/nats-keda-worker.md).

## Discover operations

```json
{"tool":"search","arguments":{"query":"coneshare share links create","limit":5}}
```

| operationId | Purpose |
|-------------|---------|
| `coneshare::coneshare_share_links_create` | Secure share link |
| `coneshare::coneshare_datarooms_create` | Virtual data room |
| `coneshare::coneshare_datarooms_add_content` | Add documents to VDR |
| `coneshare::coneshare_token_create` | Obtain JWT (when token env unset) |

## Dashboard

Agent replies enriched by the chat bridge emit `attachments[]` with `kind: "coneshare"` when execute returns `public_url` / `title`.

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [IDP Platform](../vision/clawql-idp-platform.md)
- [Agent chat contract](../dashboard/agent-chat.md)

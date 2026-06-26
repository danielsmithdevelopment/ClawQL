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

See **`packages/clawql-documents`** `DEFAULT_IDP_PIPELINE` — intake from `IDP/inbox/…`, output to `IDP/processed/…`. Full stack guide: [idp-pipeline.md](idp-pipeline.md).

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Bundled provider matrix](../../providers/README.md)

# Docling (bundled provider)

[Docling Serve](https://github.com/docling-project/docling-serve) provides **layout-aware** document conversion (PDF, Office, images) with OCR and table structure — a stronger parse path than plain Tika text extraction for classification and extraction downstream.

ClawQL exposes a curated **v1 REST** subset via the **`docling`** bundled provider ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)).

## Prerequisites

- Docling Serve reachable from the MCP server (sidecar, cluster Service, or `localhost:5001`).
- Optional API key if your deployment enables `X-Api-Key` auth.

## Environment

```bash
DOCLING_BASE_URL=http://localhost:5001
# Optional when the server requires it:
# DOCLING_API_KEY=your-key
```

## Discover operations

```json
{"tool":"search","arguments":{"query":"docling convert source","limit":5}}
```

| operationId | Purpose |
|-------------|---------|
| `docling::docling_convert_source` | Sync convert from HTTP URL or base64 `sources[]` |
| `docling::docling_convert_file` | Sync convert uploaded file (multipart) |
| `docling::docling_convert_source_async` | Submit async job; poll with `docling_status_poll` / `docling_result_get` |
| `docling::docling_health` | Health probe |

### Example: convert a URL to structured JSON

```json
{
  "tool": "execute",
  "arguments": {
    "operationId": "docling::docling_convert_source",
    "fields": {
      "body": {
        "sources": [{ "kind": "http", "url": "https://example.com/sample.pdf" }],
        "options": {
          "to_formats": ["json", "md"],
          "do_ocr": true,
          "do_table_structure": true
        }
      }
    }
  }
}
```

For large files, prefer **`docling_convert_file_async`** and poll **`docling_status_poll`** until complete, then **`docling_result_get`**.

## IDP pipeline placement

Docling typically runs **before** or **instead of** Tika when layout, tables, or form boxes matter (e.g. W-2, invoices). See [idp-pipeline.md](idp-pipeline.md) and the [lending W-2 sample pack](../../deployment/samples/lending-w2/README.md).

Pair with the [fine-tuned classifier runbook](../runbooks/fine-tuned-classifier.md) for tenant-specific document routing.

## Deploy snippet (Docker)

```bash
docker run -p 5001:5001 quay.io/docling-project/docling-serve-cpu:v1.14.3
```

Or use the reference Compose stack (Docling + classifier):

```bash
docker compose -f docker/compose/docling-classifier.compose.yml up -d
```

### Helm (in-cluster)

```yaml
documentPipeline:
  enabled: true
  docling:
    enabled: true   # ~2–6 GiB RAM; opt-in
```

When enabled, the MCP Deployment receives **`DOCLING_BASE_URL`** pointing at the chart Service. Local Docker Desktop: **`values-docker-desktop.yaml`** enables Docling + **`docling.localhost`** ingress.

**Security:** Pin **`documentPipeline.docling.image.tag`** in production; the default CPU image is upstream **quay.io/docling-project/docling-serve-cpu** — review [Docling Serve](https://github.com/docling-project/docling-serve) release notes before promote.

Verify: `curl -s http://localhost:5001/health`

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Fine-tuned classifier runbook](../runbooks/fine-tuned-classifier.md)
- [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md)
- Upstream v1 migration: [docling-serve v1 migration](https://github.com/docling-project/docling-serve/blob/main/docs/v1_migration.md)

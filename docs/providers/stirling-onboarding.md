# Stirling-PDF (bundled provider)

Stirling provides **PDF remediation and document-level PII redaction** before archive and agent-visible summaries.

## Environment

```bash
STIRLING_BASE_URL=http://stirling:8080
STIRLING_API_KEY=your-api-key
```

Helm: **`documentPipeline.stirling.auth.apiKey`** → Secret key **`STIRLING_API_KEY`** for the MCP pod.

Local Docker Desktop default dev key: **`clawql-local-stirling-dev`** (see **`values-docker-desktop.yaml`**).

## Discover operations

```json
{"tool":"search","arguments":{"query":"stirling redact pdf","limit":5}}
```

| operationId | Purpose |
| ----------- | ------- |
| `stirling::redactPdfAuto` | Automatic PII redaction |
| `stirling::redactPdfManual` | Manual redaction regions |

Refresh the large bundled spec from a live instance:

```bash
STIRLING_BASE_URL=http://stirling.localhost STIRLING_API_KEY=… npm run fetch-provider-specs
```

Optional path order: **`STIRLING_OPENAPI_PATHS=/v1/api-docs,/v3/api-docs`**.

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Introducing Stirling](../posts/introducing-clawql-stirling.md)
- IDP stack §11 — Stirling (document stage) vs Presidio (agent I/O)

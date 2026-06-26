# Gotenberg (bundled provider)

Gotenberg converts Office, HTML, and Markdown to **PDF** for downstream Stirling/Paperless steps.

## Environment

```bash
GOTENBERG_BASE_URL=http://gotenberg:3000
# Optional:
# CLAWQL_BEARER_TOKEN=…
```

Helm: **`documentPipeline.gotenberg`** injects in-cluster **`GOTENBERG_BASE_URL`**.

## Discover operations

Gotenberg’s bundled spec may omit explicit **`operationId`** fields; ClawQL derives ids from path + method (e.g. **`post_forms_libreoffice_convert`** for **`POST /forms/libreoffice/convert`**).

```json
{"tool":"search","arguments":{"query":"gotenberg libreoffice convert","limit":5}}
```

| operationId (merged) | Route |
| -------------------- | ----- |
| `gotenberg::post_forms_libreoffice_convert` | Office → PDF |
| `gotenberg::post_forms_chromium_convert_html` | HTML → PDF |
| `gotenberg::post_forms_chromium_convert_url` | URL → PDF |

## Spec refresh

```bash
GOTENBERG_BASE_URL=http://gotenberg.localhost npm run fetch-provider-specs
```

When upstream has no machine spec, the script pins Gotenberg **v7.10.0** `docs/openapi.yaml` (override: **`GOTENBERG_OPENAPI_PIN_URL`**).

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Introducing Gotenberg](../posts/introducing-clawql-gotenberg.md)

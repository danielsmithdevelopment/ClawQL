# Apache Tika (bundled provider)

Tika is the IDP **extract / detect** layer — text and metadata from heterogeneous file formats.

## Environment

```bash
TIKA_BASE_URL=http://tika:9998
# Optional if your Tika server requires auth:
# CLAWQL_BEARER_TOKEN=…
```

Helm: **`documentPipeline.tika`** injects in-cluster **`TIKA_BASE_URL`**.

## Discover operations

```json
{"tool":"search","arguments":{"query":"tika parse put","limit":5}}
```

Common operationIds:

| operationId | Purpose |
| ----------- | ------- |
| `tika::tika_parse_put` | Parse document body (PUT stream) |
| `tika::tika_detect_stream_put` | MIME detection |
| `tika::tika_meta_put` | Metadata only |

## Spec refresh

Tika 2.9.x ships a **full JAX-RS** OpenAPI in-repo when live **`/openapi.json`** is absent:

```bash
TIKA_BASE_URL=http://tika.localhost npm run fetch-provider-specs
```

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Introducing Tika](../posts/introducing-clawql-tika.md)

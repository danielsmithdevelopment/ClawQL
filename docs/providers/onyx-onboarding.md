# Onyx (bundled provider)

Onyx is the **enterprise retrieval and ingestion** layer — hybrid search with ACLs plus APIs to push trusted text (e.g. post-Paperless) into the index.

## Environment

```bash
ONYX_BASE_URL=http://onyx:8080/api
ONYX_API_TOKEN=…
CLAWQL_ENABLE_ONYX=1   # registers knowledge_search_onyx wrapper
```

Helm: **`enableOnyx: true`** + **`onyx.enabled`**; MCP gets **`ONYX_BASE_URL`** and Bearer token via Secret / **`envFromSecret`**.

## Tools

| Tool | Use |
| ---- | --- |
| **`knowledge_search_onyx`** | Natural-language query → ranked snippets + citations |
| **`execute`** on **`onyx::*`** | Full OpenAPI surface (ingestion, admin, connectors) |

Deep dive: **[onyx-knowledge-tool.md](../mcp/onyx-knowledge-tool.md)**.

## Common execute paths

```json
{"tool":"search","arguments":{"query":"onyx upsert ingestion doc","limit":5}}
```

| operationId | Purpose |
| ----------- | ------- |
| `onyx::upsert_ingestion_doc` | Push document text into ingestion API |
| `onyx::onyx_send_search_message` | Raw search API (prefer wrapper when enabled) |

Post-Paperless automation: [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120); optional Ouroboros hook **`CLAWQL_OUROBOROS_ONYX_AFTER_PAPERLESS`**.

## Spec refresh

```bash
ONYX_BASE_URL=http://onyx.localhost ONYX_API_TOKEN=… npm run fetch-provider-specs
```

Upstream OpenAPI can be very large — trim before commit if CI/build regress.

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Introducing Onyx](../posts/introducing-clawql-onyx.md)

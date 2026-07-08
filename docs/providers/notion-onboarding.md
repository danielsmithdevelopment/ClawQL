# Notion (bundled provider)

ClawQL ships the official [Notion API OpenAPI](https://developers.notion.com/openapi.json) as the **`notion`** bundled provider. Use **`search`** / **`execute`** against pages, databases, blocks, users, and search — same MCP flow as GitHub, Slack, and Sentry.

## Prerequisites

- A [Notion integration](https://www.notion.so/my-integrations) with an internal integration secret (`secret_…`).
- Content shared with the integration (pages/databases must be explicitly connected in Notion UI).

## Environment

```bash
NOTION_API_TOKEN=secret_…
# Optional — defaults to 2022-06-28 when unset:
# NOTION_VERSION=2022-06-28
```

Or via merged auth JSON:

```bash
CLAWQL_PROVIDER_AUTH_JSON='{"notion":{"Authorization":"Bearer secret_…","Notion-Version":"2022-06-28"}}'
```

## Narrow the loaded spec (recommended for agents)

The full Notion OpenAPI is large. Prefer loading only Notion:

```bash
CLAWQL_BUNDLED_PROVIDERS=notion
# or single-provider mode:
CLAWQL_PROVIDER=notion
```

## Discover operations

```json
{"tool":"search","arguments":{"query":"notion search pages","limit":8}}
```

Common merged `operationId`s (prefix `notion::` in default merge):

| operationId | Purpose |
|-------------|---------|
| `notion::post-search` | Search pages and databases shared with the integration |
| `notion::retrieve-a-page` | Get page metadata by ID |
| `notion::post-page` | Create a page under a parent page or database |
| `notion::patch-page` | Update page properties |
| `notion::post-database-query` | Query a database |
| `notion::retrieve-a-database` | Get database schema |

Exact `operationId`s match the upstream OpenAPI (kebab-case, e.g. `retrieve-a-page`).

### Example: search workspace content

```json
{
  "tool": "execute",
  "arguments": {
    "operationId": "notion::post-search",
    "fields": {
      "body": {
        "query": "project roadmap",
        "page_size": 10
      }
    }
  }
}
```

### Example: retrieve a page

```json
{
  "tool": "execute",
  "arguments": {
    "operationId": "notion::retrieve-a-page",
    "fields": {
      "path": {
        "page_id": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

## Knowledge lake roadmap

Full-workspace ingest (pages → vault Markdown) is tracked in [`docs/roadmap/knowledge-lake-roadmap.md`](../roadmap/knowledge-lake-roadmap.md). This bundled provider enables **live API** `search` / `execute` today.

## References

- [Notion API reference](https://developers.notion.com/reference/intro)
- [Authorization](https://developers.notion.com/reference/authentication)
- Bundled spec refresh: `providers/notion/README.md`

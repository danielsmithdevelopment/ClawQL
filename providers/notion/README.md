# Notion API

Source: [Notion API OpenAPI specification](https://developers.notion.com/openapi.json) (official JSON from Notion developer docs).

Notion is a **REST** API at `https://api.notion.com/v1`. Every request requires:

- `Authorization: Bearer {integration_token}` — create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
- `Notion-Version: {date}` — API version header (ClawQL default: `2022-06-28`; override with `NOTION_VERSION`)

Refresh bundled spec:

```bash
npm run fetch-provider-specs
```

Optional GraphQL artifacts (faster MCP field resolution):

```bash
npm run build && CLAWQL_PREGENERATE_ONLY=notion npm run pregenerate-graphql
```

Onboarding: [`docs/providers/notion-onboarding.md`](../../docs/providers/notion-onboarding.md).

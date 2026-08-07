# clawql-web

Pluggable **web search** and **browser/fetch** for the Agentic Gateway.

ClawQL does not pick one vendor as truth. Operators choose providers by environment (and optional Helm subcharts). Regulated deployments can disable external web entirely or run SearXNG / OpenSearch inside the perimeter.

## Interfaces

| Interface            | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `WebSearchProvider`  | `query → SearchResult[]`                               |
| `WebBrowserProvider` | `url → PageContent` (+ optional screenshot / interact) |

## Providers

**Search:** `tavily` · `brave` · `searxng` · `opensearch` · `none`  
**Browser:** `kitesurf` · `chromium` · `playwright` · `puppeteer` · `firecrawl` · `none`

Playwright/Puppeteer are automation API variants over the same Chromium/Browser Run backend.

## Fallback

When no search provider is configured and `CLAWQL_WEB_SEARCH_FALLBACK_DISABLED` is unset, `web_search` falls back to **browser-as-search**. A `WEB_SEARCH_FALLBACK` audit event is written **before** the browser call so compliance reviews see the decision even if the fallback fails.

## MCP tools (`CLAWQL_ENABLE_WEB` / auto)

| Tool             | Role                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `web_search`     | Query → ranked results (+ fallback)                              |
| `web_fetch`      | URL → markdown/text, or `raw: true` → bytes + content-type (IDP) |
| `web_screenshot` | URL → image (CDP when configured; capability-gated)              |
| `web_interact`   | URL + steps → page (live CDP; capability-gated)                  |

IDP URL ingest (`clawql-documents`) uses `fetchRawUrl`. Audit events are hash-chained WORM + MCP `audit` ring.

## Quick start

```bash
export CLAWQL_ENABLE_WEB=1
export CLAWQL_WEB_DRY_RUN=1
export CLAWQL_WEB_BROWSER_PROVIDER=kitesurf
# optional paid search:
# export CLAWQL_WEB_SEARCH_PROVIDER=tavily
# export CLAWQL_TAVILY_API_KEY=…

npm test -w clawql-web
```

Live Kitesurf (Cloudflare Browser Run):

```bash
export CLAWQL_WEB_BROWSER_PROVIDER=kitesurf
export CLAWQL_BROWSER_RUN_API_TOKEN=…
export CLAWQL_CLOUDFLARE_ACCOUNT_ID=…
```

Docs: [`docs/web/clawql-web.md`](../../docs/web/clawql-web.md)

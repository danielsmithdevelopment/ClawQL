---
title: Web
description: Pluggable web_search / web_fetch / web_screenshot / web_interact via clawql-web (Tavily, Brave, SearXNG, OpenSearch, Kitesurf, Chromium, Firecrawl).
slug: web
status: scaffold
package: clawql-web
order: 11
prev: payments
next: ouroboros
---

# Web (`clawql-web`)

**Status:** Tier-1 scaffold  
**Package:** [`packages/clawql-web`](../../packages/clawql-web)  
**Toggle:** `CLAWQL_ENABLE_WEB` (or auto-on when a provider/API key is configured)  
**Plugin:** `clawql-web`

## MCP tools

| Tool | When |
| --- | --- |
| **`web_search`** | Web enabled — falls back to browser-as-search with audit if no search provider |
| **`web_fetch`** | Browser provider configured |
| **`web_screenshot`** | Browser provider with screenshot capability |
| **`web_interact`** | Chromium / Playwright / Puppeteer |

## Enable

```bash
export CLAWQL_ENABLE_WEB=1
export CLAWQL_WEB_BROWSER_PROVIDER=kitesurf
export CLAWQL_WEB_DRY_RUN=1   # local demos
```

Full guide: [clawql-web](../web/clawql-web.md).

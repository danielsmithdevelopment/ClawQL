# clawql-web — pluggable search & browser

**Status:** Tier-1 scaffold  
**Package:** [`packages/clawql-web`](../../packages/clawql-web)  
**Plugin ID:** `clawql-web`

Every managed web search/scrape API is paid or burns free tiers under agent load. ClawQL therefore treats web access as **pluggable**: mix a search provider and a browser provider, or run fully self-hosted / disabled for regulated environments.

## Taxonomy

| Kind | Providers | Notes |
| --- | --- | --- |
| **Search** | Tavily, Brave, SearXNG, OpenSearch | Find content by query |
| **Browser / fetch** | Kitesurf, Chromium, Playwright, Puppeteer, Firecrawl | URL → content / screenshot / interact |

Local document conversion (pdf-inspector / anydoc) stays in `clawql-documents` — zero-cost, on-box. `clawql-web` owns **external** web access; IDP URL ingestion should import from here over time.

## Defaults by deployment

| Environment | Search | Browser |
| --- | --- | --- |
| Developer / Teams hosted | Tavily (if key) or none | **Kitesurf** (Browser Run beta) |
| Self-hosted open | SearXNG (optional bundle) | Kitesurf or Chromium |
| Regulated / air-gapped | OpenSearch (internal) or **disabled** | Chromium self-hosted or **disabled** |
| Enterprise managed | Brave (DPA) or OpenSearch | Kitesurf or Chromium |

## Env

```bash
CLAWQL_ENABLE_WEB=1                    # or auto when a provider/key is set
CLAWQL_WEB_SEARCH_PROVIDER=tavily|brave|searxng|opensearch|none
CLAWQL_WEB_BROWSER_PROVIDER=kitesurf|chromium|playwright|puppeteer|firecrawl|none
CLAWQL_WEB_SEARCH_FALLBACK_DISABLED=1  # opt out of browser-as-search
CLAWQL_WEB_DRY_RUN=1                   # synthetic results (tests / demos)

CLAWQL_TAVILY_API_KEY=…
CLAWQL_BRAVE_API_KEY=…
CLAWQL_SEARXNG_URL=http://searxng:8080
CLAWQL_OPENSEARCH_URL=https://opensearch:9200
CLAWQL_OPENSEARCH_INDEX=clawql-web
CLAWQL_FIRECRAWL_API_KEY=…
CLAWQL_BROWSER_RUN_API_TOKEN=…         # Cloudflare Browser Run
CLAWQL_CLOUDFLARE_ACCOUNT_ID=…
CLAWQL_CHROMIUM_CDP_URL=ws://chromium:9222
```

## Fallback audit

```text
WEB_SEARCH_FALLBACK { reason: no_search_provider_configured, fallback: browser, provider: kitesurf }
WEB_SEARCH          { provider: browser:kitesurf, detail: fallback, ok: true }
```

The fallback decision is appended **before** the browser call.

## MCP tools

| Tool | Behavior |
| --- | --- |
| `web_search` | Search provider, else browser fallback |
| `web_fetch` | Browser provider fetch |
| `web_screenshot` | Capability-gated |
| `web_interact` | Capability-gated (chromium family) |

## Helm sketch (optional subcharts)

```yaml
webSearch:
  provider: none          # tavily|brave|searxng|opensearch|none
  tavily:
    enabled: false
  brave:
    enabled: false
  searxng:
    enabled: false
    bundled: false        # deploy SearXNG subchart
  opensearch:
    enabled: false
    bundled: false

webBrowser:
  provider: kitesurf      # recommended zero-cost fetch in Cloudflare stack
  chromium:
    enabled: false
    bundled: false
```

SearXNG/OpenSearch as bundled subcharts follow the same opt-in pattern as Onyx — one flag for regulated operators who accept the quality/ops tradeoffs documented in product discussions (rate limits, scraping gray zone, LLM post-processing).

## Related

- [`docs/plugins/web.md`](../plugins/web.md) — plugin page  
- Local docs convert: [`docs/providers/anydoc-onboarding.md`](../providers/anydoc-onboarding.md), [`pdf-inspector-onboarding.md`](../providers/pdf-inspector-onboarding.md)

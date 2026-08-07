# clawql-web — pluggable search & browser

**Status:** Tier-1 scaffold  
**Package:** [`packages/clawql-web`](../../packages/clawql-web)  
**Plugin ID:** `clawql-web`

Every managed web search/scrape API is paid or burns free tiers under agent load. ClawQL therefore treats web access as **pluggable**: mix a search provider and a browser provider, or run fully self-hosted / disabled for regulated environments.

## Regulated / enterprise posture

For regulated and air-gapped tenants, the intended posture is:

| Control | Default / recommendation |
| ------- | ------------------------ |
| **Search** | **Disabled** (`CLAWQL_WEB_SEARCH_PROVIDER=none`) — no Tavily/Brave egress |
| **Browser** | **Self-hosted Chromium** (or `none`) — no Cloudflare Browser Run / Firecrawl SaaS |
| **External calls** | **None** unless an operator explicitly enables a provider |
| **Helm** | `enableWeb: false`; `webSearch.provider: none`; leave `*.bundled: false` |

That combination is sales collateral for the enterprise motion: ClawQL can run with **zero outbound web** while still offering optional self-hosted search (OpenSearch / BYO SearXNG) and on-box browser fetch when policy allows.

## Taxonomy

| Kind                | Providers                                            | Notes                                 |
| ------------------- | ---------------------------------------------------- | ------------------------------------- |
| **Search**          | Tavily, Brave, SearXNG, OpenSearch                   | Find content by query                 |
| **Browser / fetch** | Kitesurf, Chromium, Playwright, Puppeteer, Firecrawl | URL → content / screenshot / interact |

Local document conversion (pdf-inspector / anydoc) stays in `clawql-documents` — zero-cost, on-box. **`clawql-web` is the single package for external web access.** The IDP pipeline **will** import URL ingestion from here (follow-on PR after this scaffold lands) so agent `web_fetch` and IDP URL ingest share one provider surface — including Firecrawl as one browser provider serving both consumers.

## IDP migration (follow-on)

**Do not migrate IDP in the scaffold PR.** Ship `clawql-web` first (tests green, Helm sketch reviewed), then switch IDP in a separate PR for a cleaner bisect.

Today IDP URL ingest lives in `packages/clawql-documents/src/ingest/external-ingest.ts` (`fetchUrlResource`). Behaviors the migration must preserve or deliberately change:

| Behavior | Current IDP (`fetchUrlResource`) | `clawql-web` target |
| -------- | -------------------------------- | ------------------- |
| User-Agent | `clawql-mcp-external-ingest/1.0` | `clawql-web/1.0` (intentional rename; document in migration PR) |
| Accept | `*/*` | same |
| Redirects | Manual, max **5**, re-check SSRF each hop | same (`fetchRawUrl`) |
| Timeout | **60s** | same (overridable via `timeoutMs`) |
| Body / Content-Length cap | **2 MiB** | same |
| SSRF | https, or http only for localhost; block private/link-local + metadata hosts | same (`assertSafeWebUrl`) |
| Return shape | UTF-8 **string** body + content-type + finalUrl | `raw: true` → **bytes** + content-type + finalUrl (needed so pdf-inspector can classify before Docling) |
| Content types | PDF, Office, HTML, raw text | unchanged — classification stays in documents/pdf-inspector |

### `web_fetch` and `raw: true`

- Default `web_fetch`: browser provider → clean markdown/text for agents.
- `web_fetch` with **`raw: true`**: direct HTTPS fetcher (`fetchRawUrl`) → `{ bytes, contentType, finalUrl }` — **no browser provider required**. This is the IDP / pdf-inspector path.

## Defaults by deployment

| Environment              | Search                                | Browser                              |
| ------------------------ | ------------------------------------- | ------------------------------------ |
| Developer / Teams hosted | Tavily (if key) or none               | **Kitesurf** (Browser Run beta)      |
| Self-hosted open         | SearXNG (optional future bundle)      | Kitesurf or Chromium                 |
| Regulated / air-gapped   | OpenSearch (internal) or **disabled** | Chromium self-hosted or **disabled** |
| Enterprise managed       | Brave (DPA) or OpenSearch             | Kitesurf or Chromium                 |

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
# or, if browser throws after the fallback decision:
WEB_ERROR           { reason: browser_fallback_failed, ok: false }
```

The fallback decision is appended **before** the browser call so a WORM/compliance sink still records `WEB_SEARCH_FALLBACK` even when the browser provider fails.

## Capability degradation

`web_screenshot` and `web_interact` check capabilities **before** execute. When the browser provider is `none` (or search-only / unsupported), tools return a structured `WebCapabilityError`:

```json
{ "error": { "code": "NO_BROWSER_PROVIDER", "reason": "…" } }
{ "error": { "code": "CAPABILITY_UNSUPPORTED", "provider": "firecrawl", "capability": "screenshot" } }
```

## MCP tools

| Tool             | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `web_search`     | Search provider, else browser fallback (audited before execute)          |
| `web_fetch`      | Browser markdown fetch; or `raw: true` for bytes + content-type (IDP)    |
| `web_screenshot` | Capability-gated (`NO_BROWSER_PROVIDER` / `CAPABILITY_UNSUPPORTED`)      |
| `web_interact`   | Capability-gated (chromium family)                                       |

## Helm sketch (optional subcharts — **not wired yet**)

```yaml
webSearch:
  provider: none # tavily|brave|searxng|opensearch|none
  tavily:
    enabled: false
  brave:
    enabled: false
  searxng:
    enabled: false
    bundled: false # FUTURE ONLY — does not deploy a SearXNG subchart today
  opensearch:
    enabled: false
    bundled: false # FUTURE ONLY — does not deploy OpenSearch for web today

webBrowser:
  provider: kitesurf # recommended zero-cost fetch in Cloudflare stack
  chromium:
    enabled: false
    bundled: false # FUTURE ONLY
```

**`webSearch.searxng.bundled` is a flag for a future item**, not a live Helm dependency. Setting `bundled: true` does **not** install SearXNG; operators must BYO `CLAWQL_SEARXNG_URL` until a subchart is wired (same opt-in pattern as Onyx). Charts values already comment these as `future:`.

## Related

- [`docs/plugins/web.md`](../plugins/web.md) — plugin page
- Local docs convert: [`docs/providers/anydoc-onboarding.md`](../providers/anydoc-onboarding.md), [`pdf-inspector-onboarding.md`](../providers/pdf-inspector-onboarding.md)
- Current IDP URL ingest (pre-migration): `packages/clawql-documents/src/ingest/external-ingest.ts`

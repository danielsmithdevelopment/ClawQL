# clawql-web — pluggable search & browser

**Status:** Tier-1 + follow-ons (IDP fetch, CDP, WORM, Helm bundle)  
**Package:** [`packages/clawql-web`](../../packages/clawql-web)  
**Plugin ID:** `clawql-web`

Every managed web search/scrape API is paid or burns free tiers under agent load. ClawQL therefore treats web access as **pluggable**: mix a search provider and a browser provider, or run fully self-hosted / disabled for regulated environments.

## Regulated / enterprise posture

For regulated and air-gapped tenants, the intended posture is:

| Control            | Default / recommendation                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Search**         | **Disabled** (`CLAWQL_WEB_SEARCH_PROVIDER=none`) — no Tavily/Brave egress                                                 |
| **Browser**        | **Self-hosted Chromium** (or `none`) — no Cloudflare Browser Run / Firecrawl SaaS                                         |
| **External calls** | **None** unless an operator explicitly enables a provider                                                                 |
| **Helm**           | `enableWeb: false`; `webSearch.provider: none`; leave `*.bundled: false` unless policy allows in-cluster SearXNG/Chromium |
| **Audit**          | Hash-chained WORM under `$CLAWQL_HOME/Web/audit.jsonl` (+ MCP `audit` ring mirror)                                        |

That combination is sales collateral for the enterprise motion: ClawQL can run with **zero outbound web** while still offering optional self-hosted search (OpenSearch / BYO or bundled SearXNG) and on-box browser fetch when policy allows.

## Taxonomy

| Kind                | Providers                                            | Notes                                 |
| ------------------- | ---------------------------------------------------- | ------------------------------------- |
| **Search**          | Tavily, Brave, SearXNG, OpenSearch                   | Find content by query                 |
| **Browser / fetch** | Kitesurf, Chromium, Playwright, Puppeteer, Firecrawl | URL → content / screenshot / interact |

Local document conversion (pdf-inspector / anydoc) stays in `clawql-documents`. **`clawql-web` is the single package for external web access.** IDP URL ingest **imports from here** (`fetchRawUrl` / `assertSafeWebUrl`) so agent `web_fetch` and IDP URL ingest share one provider surface — including Firecrawl as one browser provider serving both consumers.

## IDP migration (done)

`packages/clawql-documents` depends on `clawql-web`. `fetchUrlResource` delegates to `fetchRawUrl` and returns:

- `body` — UTF-8 string (markdown / HTML / text formatting path)
- `bytes` — raw `Uint8Array` for pdf-inspector / anydoc / Docling
- `contentType` + `finalUrl`

Binary content types (PDF / Office / octet-stream) are written as base64 vault notes so classification can run without lossy UTF-8 decode.

| Behavior                  | Preserved via `fetchRawUrl`                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| Accept                    | `*/*`                                                                       |
| Redirects                 | Manual, max **5**, SSRF re-check each hop                                   |
| Timeout                   | **60s** (overridable)                                                       |
| Body / Content-Length cap | **2 MiB**                                                                   |
| SSRF                      | https, or http only for localhost; block private/link-local + metadata      |
| User-Agent                | `clawql-web/1.0` (intentional rename from `clawql-mcp-external-ingest/1.0`) |

### `web_fetch` and `raw: true`

- Default: browser provider → clean markdown/text for agents.
- `raw: true`: direct HTTPS fetcher → `{ bytes, contentType, finalUrl }` — **no browser provider required**.

## Defaults by deployment

| Environment              | Search                                | Browser                              |
| ------------------------ | ------------------------------------- | ------------------------------------ |
| Developer / Teams hosted | Tavily (if key) or none               | **Kitesurf** (Browser Run beta)      |
| Self-hosted open         | SearXNG (optional bundle)             | Kitesurf or Chromium                 |
| Regulated / air-gapped   | OpenSearch (internal) or **disabled** | Chromium self-hosted or **disabled** |
| Enterprise managed       | Brave (DPA) or OpenSearch             | Kitesurf or Chromium                 |

## Env

```bash
CLAWQL_ENABLE_WEB=1
CLAWQL_WEB_SEARCH_PROVIDER=tavily|brave|searxng|opensearch|none
CLAWQL_WEB_BROWSER_PROVIDER=kitesurf|chromium|playwright|puppeteer|firecrawl|none
CLAWQL_WEB_SEARCH_FALLBACK_DISABLED=1
CLAWQL_WEB_DRY_RUN=1
CLAWQL_WEB_AUDIT_STORE=memory|jsonl|off   # default: jsonl when CLAWQL_HOME set, else memory

CLAWQL_TAVILY_API_KEY=…
CLAWQL_BRAVE_API_KEY=…
CLAWQL_SEARXNG_URL=http://searxng:8080
CLAWQL_OPENSEARCH_URL=https://opensearch:9200
CLAWQL_OPENSEARCH_INDEX=clawql-web
CLAWQL_FIRECRAWL_API_KEY=…
CLAWQL_BROWSER_RUN_API_TOKEN=…
CLAWQL_CLOUDFLARE_ACCOUNT_ID=…
CLAWQL_CHROMIUM_CDP_URL=http://chromium:9222   # or ws://… debugger URL
```

## Fallback audit

```text
WEB_SEARCH_FALLBACK { reason: no_search_provider_configured, fallback: browser, provider: kitesurf }
WEB_SEARCH          { provider: browser:kitesurf, detail: fallback, ok: true }
# or, if browser throws after the fallback decision:
WEB_ERROR           { reason: browser_fallback_failed, ok: false }
```

The fallback decision is appended **before** the browser call. With the WORM sink installed (plugin registration), each event is also hash-chained into `$CLAWQL_HOME/Web/audit.jsonl` (or in-memory) and mirrored to the clawql-core MCP `audit` ring buffer.

## Capability degradation

`web_screenshot` / `web_interact` return structured `WebCapabilityError`:

```json
{ "error": { "code": "NO_BROWSER_PROVIDER", "reason": "…" } }
{ "error": { "code": "CAPABILITY_UNSUPPORTED", "provider": "firecrawl", "capability": "screenshot" } }
```

## Live CDP (Chromium / Playwright / Puppeteer ids)

When `CLAWQL_CHROMIUM_CDP_URL` is set (and dry-run is off), the chromium-family providers use a **minimal CDP WebSocket client** (no Playwright/Puppeteer npm dependency) for:

- `web_fetch` — navigate + DOM text/html
- `web_screenshot` — `Page.captureScreenshot`
- `web_interact` — click / type / wait / navigate via `Runtime.evaluate`

HTTP base URLs are resolved via `/json/version` → `webSocketDebuggerUrl`.

## MCP tools

| Tool             | Behavior                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `web_search`     | Search provider, else browser fallback (audited before execute)       |
| `web_fetch`      | Browser markdown fetch; or `raw: true` for bytes + content-type (IDP) |
| `web_screenshot` | Capability-gated; live CDP when configured                            |
| `web_interact`   | Capability-gated; live CDP when configured                            |

## Helm — bundled SearXNG / Chromium

`charts/clawql-mcp/templates/web-stack.yaml` deploys optional in-cluster workloads when:

```yaml
enableWeb: true
webSearch:
  provider: searxng
  searxng:
    enabled: true
    bundled: true # deploys Deployment+Service; injects CLAWQL_SEARXNG_URL
webBrowser:
  provider: chromium
  chromium:
    enabled: true
    bundled: true # deploys headless Chromium; injects CLAWQL_CHROMIUM_CDP_URL
webAuditStore: jsonl # optional
```

These are **in-chart Deployments**, not Chart.yaml Helm dependencies. OpenSearch for web is **not** bundled here — BYO `CLAWQL_OPENSEARCH_URL` or reuse the Onyx OpenSearch stack.

## Related

- [`docs/plugins/web.md`](../plugins/web.md)
- IDP ingest: `packages/clawql-documents/src/ingest/external-ingest.ts`
- Local docs convert: [`docs/providers/anydoc-onboarding.md`](../providers/anydoc-onboarding.md), [`pdf-inspector-onboarding.md`](../providers/pdf-inspector-onboarding.md)

/**
 * Orchestration: search with optional browser fallback, fetch/screenshot/interact.
 */

import { appendWebAudit } from "./audit.js";
import { loadWebConfig, type WebConfig } from "./config.js";
import { WebCapabilityError } from "./errors.js";
import type {
  BrowserStep,
  FetchOptions,
  PageContent,
  SearchOptions,
  SearchResponse,
  WebBrowserProvider,
  WebSearchProvider,
} from "./interfaces.js";
import { browserAsSearch } from "./providers/fallback-search.js";
import { fetchRawUrl } from "./providers/browser/raw-fetch.js";
import { resolveBrowserProvider } from "./providers/browser/resolve.js";
import { resolveSearchProvider } from "./providers/search/resolve.js";

export type WebService = {
  config: WebConfig;
  searchProvider?: WebSearchProvider;
  browserProvider?: WebBrowserProvider;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
  fetch(url: string, options?: FetchOptions): Promise<PageContent>;
  screenshot(url: string, options?: FetchOptions): Promise<Uint8Array>;
  interact(url: string, steps: BrowserStep[], options?: FetchOptions): Promise<PageContent>;
};

function requireBrowser(
  browserProvider: WebBrowserProvider | undefined,
  tool: string
): WebBrowserProvider {
  if (!browserProvider) {
    throw new WebCapabilityError({
      code: "NO_BROWSER_PROVIDER",
      reason:
        "No browser provider configured (CLAWQL_WEB_BROWSER_PROVIDER=none or unset). " +
        "Search-only providers (e.g. SearXNG) cannot run browser tools.",
      capability: tool,
    });
  }
  return browserProvider;
}

function requireCapability(
  browser: WebBrowserProvider,
  capability: "fetch" | "screenshot" | "interact",
  _tool: string
): void {
  const caps = browser.capabilities;
  const supported =
    capability === "fetch"
      ? caps.fetch
      : capability === "screenshot"
        ? caps.screenshot && typeof browser.screenshot === "function"
        : caps.interact && typeof browser.interact === "function";
  if (!supported) {
    throw new WebCapabilityError({
      code: "CAPABILITY_UNSUPPORTED",
      reason: `Browser provider "${browser.id}" does not support ${capability}.`,
      provider: browser.id,
      capability,
    });
  }
}

export function createWebService(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): WebService {
  const config = loadWebConfig(env);
  const searchProvider = resolveSearchProvider(config, fetchImpl);
  const browserProvider = resolveBrowserProvider(config, fetchImpl);

  return {
    config,
    searchProvider,
    browserProvider,

    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
      const q = query.trim();
      if (!q) throw new Error("query is required");

      if (searchProvider) {
        const result = await searchProvider.search(q, options);
        await appendWebAudit({
          type: "WEB_SEARCH",
          provider: searchProvider.id,
          query: q,
          correlationId: options?.correlationId,
          ok: true,
        });
        return result;
      }

      if (!config.searchFallbackToBrowser || !browserProvider) {
        await appendWebAudit({
          type: "WEB_ERROR",
          query: q,
          reason: "no_search_provider_and_no_browser_fallback",
          ok: false,
          correlationId: options?.correlationId,
        });
        throw new WebCapabilityError({
          code: "NO_SEARCH_PROVIDER",
          reason:
            "No web search provider configured. Set CLAWQL_WEB_SEARCH_PROVIDER or enable browser fallback.",
        });
      }

      // Audit BEFORE fallback executes (compliance: record even if browser throws)
      await appendWebAudit({
        type: "WEB_SEARCH_FALLBACK",
        reason: "no_search_provider_configured",
        fallback: "browser",
        provider: browserProvider.id,
        query: q,
        correlationId: options?.correlationId,
      });

      try {
        const result = await browserAsSearch(q, browserProvider, options);
        await appendWebAudit({
          type: "WEB_SEARCH",
          provider: result.provider,
          query: q,
          ok: true,
          detail: "fallback",
          correlationId: options?.correlationId,
        });
        return result;
      } catch (err) {
        await appendWebAudit({
          type: "WEB_ERROR",
          provider: browserProvider.id,
          query: q,
          reason: "browser_fallback_failed",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          correlationId: options?.correlationId,
        });
        throw err;
      }
    },

    async fetch(url: string, options?: FetchOptions): Promise<PageContent> {
      // Raw path: IDP / pdf-inspector — bytes + content-type, no browser required
      if (options?.raw === true) {
        try {
          const raw = await fetchRawUrl(url, {
            timeoutMs: options.timeoutMs,
            dryRun: config.dryRun,
            fetchImpl,
          });
          await appendWebAudit({
            type: "WEB_FETCH",
            provider: raw.provider,
            url,
            ok: true,
            detail: "raw",
            correlationId: options?.correlationId,
          });
          return {
            url: raw.url,
            finalUrl: raw.finalUrl,
            bytes: raw.bytes,
            contentType: raw.contentType,
            provider: raw.provider,
          };
        } catch (err) {
          await appendWebAudit({
            type: "WEB_ERROR",
            url,
            reason: "raw_fetch_failed",
            ok: false,
            detail: err instanceof Error ? err.message : String(err),
            correlationId: options?.correlationId,
          });
          throw err;
        }
      }

      const browser = requireBrowser(browserProvider, "web_fetch");
      requireCapability(browser, "fetch", "web_fetch");
      try {
        const page = await browser.fetch(url, options);
        await appendWebAudit({
          type: "WEB_FETCH",
          provider: browser.id,
          url,
          ok: true,
          correlationId: options?.correlationId,
        });
        return page;
      } catch (err) {
        await appendWebAudit({
          type: "WEB_ERROR",
          provider: browser.id,
          url,
          reason: "fetch_failed",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          correlationId: options?.correlationId,
        });
        throw err;
      }
    },

    async screenshot(url: string, options?: FetchOptions): Promise<Uint8Array> {
      const browser = requireBrowser(browserProvider, "web_screenshot");
      requireCapability(browser, "screenshot", "web_screenshot");
      const buf = await browser.screenshot!(url, options);
      await appendWebAudit({
        type: "WEB_SCREENSHOT",
        provider: browser.id,
        url,
        ok: true,
        correlationId: options?.correlationId,
      });
      return buf;
    },

    async interact(
      url: string,
      steps: BrowserStep[],
      options?: FetchOptions
    ): Promise<PageContent> {
      const browser = requireBrowser(browserProvider, "web_interact");
      requireCapability(browser, "interact", "web_interact");
      const page = await browser.interact!(url, steps, options);
      await appendWebAudit({
        type: "WEB_INTERACT",
        provider: browser.id,
        url,
        ok: true,
        correlationId: options?.correlationId,
      });
      return page;
    },
  };
}

/**
 * Orchestration: search with optional browser fallback, fetch/screenshot/interact.
 */

import { appendWebAudit } from "./audit.js";
import { loadWebConfig, type WebConfig } from "./config.js";
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
        throw new Error(
          "No web search provider configured. Set CLAWQL_WEB_SEARCH_PROVIDER or enable browser fallback."
        );
      }

      // Audit BEFORE fallback executes (compliance requirement)
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
      if (!browserProvider) {
        throw new Error("No web browser provider configured (CLAWQL_WEB_BROWSER_PROVIDER)");
      }
      if (!browserProvider.capabilities.fetch) {
        throw new Error(`Browser provider ${browserProvider.id} does not support fetch`);
      }
      try {
        const page = await browserProvider.fetch(url, options);
        await appendWebAudit({
          type: "WEB_FETCH",
          provider: browserProvider.id,
          url,
          ok: true,
          correlationId: options?.correlationId,
        });
        return page;
      } catch (err) {
        await appendWebAudit({
          type: "WEB_ERROR",
          provider: browserProvider.id,
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
      if (!browserProvider) {
        throw new Error("No web browser provider configured");
      }
      if (!browserProvider.capabilities.screenshot || !browserProvider.screenshot) {
        throw new Error(
          `Browser provider ${browserProvider.id} does not support screenshot`
        );
      }
      const buf = await browserProvider.screenshot(url, options);
      await appendWebAudit({
        type: "WEB_SCREENSHOT",
        provider: browserProvider.id,
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
      if (!browserProvider) {
        throw new Error("No web browser provider configured");
      }
      if (!browserProvider.capabilities.interact || !browserProvider.interact) {
        throw new Error(
          `Browser provider ${browserProvider.id} does not support interact`
        );
      }
      const page = await browserProvider.interact(url, steps, options);
      await appendWebAudit({
        type: "WEB_INTERACT",
        provider: browserProvider.id,
        url,
        ok: true,
        correlationId: options?.correlationId,
      });
      return page;
    },
  };
}

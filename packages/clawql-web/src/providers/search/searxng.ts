import type { SearchOptions, SearchResponse, WebSearchProvider } from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

export function createSearxngSearchProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebSearchProvider {
  return {
    id: "searxng",
    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
      const limit = options?.limit ?? config.defaultSearchLimit;
      if (config.dryRun || !config.searxngUrl) {
        if (!config.dryRun && !config.searxngUrl) {
          throw new Error("SearXNG requires CLAWQL_SEARXNG_URL (or CLAWQL_WEB_DRY_RUN=1)");
        }
        return {
          query,
          provider: "searxng",
          results: [
            {
              title: `[dry-run] ${query}`,
              url: `https://example.com/?q=${encodeURIComponent(query)}`,
              snippet: "Dry-run SearXNG result — set CLAWQL_SEARXNG_URL for self-hosted search.",
            },
          ].slice(0, limit),
        };
      }

      const base = config.searxngUrl.replace(/\/$/, "");
      const url = new URL(`${base}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`SearXNG search failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string; engine?: string }>;
      };
      return {
        query,
        provider: "searxng",
        results: (body.results ?? []).slice(0, limit).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content,
          source: r.engine ?? "searxng",
        })),
      };
    },
  };
}

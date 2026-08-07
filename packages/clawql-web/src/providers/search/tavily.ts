import type { SearchOptions, SearchResponse, WebSearchProvider } from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

export function createTavilySearchProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebSearchProvider {
  return {
    id: "tavily",
    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
      const limit = options?.limit ?? config.defaultSearchLimit;
      if (config.dryRun || !config.tavilyApiKey) {
        if (!config.dryRun && !config.tavilyApiKey) {
          throw new Error("Tavily requires CLAWQL_TAVILY_API_KEY (or CLAWQL_WEB_DRY_RUN=1)");
        }
        return {
          query,
          provider: "tavily",
          results: [
            {
              title: `[dry-run] ${query}`,
              url: `https://example.com/search?q=${encodeURIComponent(query)}`,
              snippet: "Dry-run Tavily result — set CLAWQL_TAVILY_API_KEY for live search.",
            },
          ].slice(0, limit),
        };
      }

      const res = await fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: config.tavilyApiKey,
          query,
          max_results: limit,
        }),
      });
      if (!res.ok) {
        throw new Error(`Tavily search failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
      };
      return {
        query,
        provider: "tavily",
        results: (body.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content,
          score: r.score,
          source: "tavily",
        })),
      };
    },
  };
}

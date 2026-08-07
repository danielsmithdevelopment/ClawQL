import type { SearchOptions, SearchResponse, WebSearchProvider } from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

export function createBraveSearchProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebSearchProvider {
  return {
    id: "brave",
    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
      const limit = options?.limit ?? config.defaultSearchLimit;
      if (config.dryRun || !config.braveApiKey) {
        if (!config.dryRun && !config.braveApiKey) {
          throw new Error("Brave Search requires CLAWQL_BRAVE_API_KEY (or CLAWQL_WEB_DRY_RUN=1)");
        }
        return {
          query,
          provider: "brave",
          results: [
            {
              title: `[dry-run] ${query}`,
              url: `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
              snippet: "Dry-run Brave result — set CLAWQL_BRAVE_API_KEY for live search.",
            },
          ].slice(0, limit),
        };
      }

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(limit));
      const res = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": config.braveApiKey,
        },
      });
      if (!res.ok) {
        throw new Error(`Brave search failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }>; };
      };
      return {
        query,
        provider: "brave",
        results: (body.web?.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.description,
          source: "brave",
        })),
      };
    },
  };
}

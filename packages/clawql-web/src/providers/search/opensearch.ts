import type { SearchOptions, SearchResponse, WebSearchProvider } from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

/** Self-hosted OpenSearch / Elasticsearch index search (maximum sovereignty). */
export function createOpensearchSearchProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebSearchProvider {
  return {
    id: "opensearch",
    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
      const limit = options?.limit ?? config.defaultSearchLimit;
      if (config.dryRun || !config.opensearchUrl) {
        if (!config.dryRun && !config.opensearchUrl) {
          throw new Error("OpenSearch requires CLAWQL_OPENSEARCH_URL (or CLAWQL_WEB_DRY_RUN=1)");
        }
        return {
          query,
          provider: "opensearch",
          results: [
            {
              title: `[dry-run] ${query}`,
              url: `https://internal.example/docs?q=${encodeURIComponent(query)}`,
              snippet: "Dry-run OpenSearch result — point CLAWQL_OPENSEARCH_URL at your index.",
            },
          ].slice(0, limit),
        };
      }

      const base = config.opensearchUrl.replace(/\/$/, "");
      const index = config.opensearchIndex ?? "clawql-web";
      const res = await fetchImpl(`${base}/${encodeURIComponent(index)}/_search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          size: limit,
          query: {
            multi_match: {
              query,
              fields: ["title^2", "content", "text", "snippet"],
            },
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenSearch search failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        hits?: {
          hits?: Array<{
            _score?: number;
            _source?: { title?: string; url?: string; content?: string; snippet?: string };
          }>;
        };
      };
      return {
        query,
        provider: "opensearch",
        results: (body.hits?.hits ?? []).map((h) => ({
          title: h._source?.title ?? "",
          url: h._source?.url ?? "",
          snippet: h._source?.snippet ?? h._source?.content,
          score: h._score,
          source: "opensearch",
        })),
      };
    },
  };
}

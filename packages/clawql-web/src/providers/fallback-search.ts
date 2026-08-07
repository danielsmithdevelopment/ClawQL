/**
 * Last-resort search: navigate a public search engine via the browser provider
 * and extract title/url/snippet heuristics from markdown/text.
 */

import type { WebBrowserProvider, SearchOptions, SearchResponse } from "../interfaces.js";

function extractResultsFromText(query: string, text: string, limit: number): SearchResponse["results"] {
  const results: SearchResponse["results"] = [];
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null && results.length < limit) {
    const title = m[1]?.trim() ?? "";
    const url = m[2]?.trim() ?? "";
    if (!url || url.includes("google.com/search") || url.includes("duckduckgo.com/?q=")) continue;
    results.push({
      title: title || url,
      url,
      snippet: `Extracted via browser-as-search for “${query}”`,
      source: "browser-fallback",
    });
  }
  if (results.length === 0) {
    results.push({
      title: `Browser fallback search: ${query}`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet:
        "No structured links extracted from browser page — open the search URL or configure a search provider.",
      source: "browser-fallback",
    });
  }
  return results.slice(0, limit);
}

export async function browserAsSearch(
  query: string,
  browser: WebBrowserProvider,
  options?: SearchOptions
): Promise<SearchResponse> {
  const limit = options?.limit ?? 5;
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const page = await browser.fetch(searchUrl, {
    format: "markdown",
    correlationId: options?.correlationId,
  });
  const text = page.markdown ?? page.text ?? page.html ?? "";
  return {
    query,
    provider: `browser:${browser.id}`,
    fallback: true,
    fallbackReason: "no_search_provider_configured",
    results: extractResultsFromText(query, text, limit),
  };
}

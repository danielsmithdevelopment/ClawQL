import type { WebConfig } from "../../config.js";
import type { WebSearchProvider } from "../../interfaces.js";
import { createTavilySearchProvider } from "./tavily.js";
import { createBraveSearchProvider } from "./brave.js";
import { createSearxngSearchProvider } from "./searxng.js";
import { createOpensearchSearchProvider } from "./opensearch.js";

export function resolveSearchProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebSearchProvider | undefined {
  switch (config.searchProvider) {
    case "tavily":
      return createTavilySearchProvider(config, fetchImpl);
    case "brave":
      return createBraveSearchProvider(config, fetchImpl);
    case "searxng":
      return createSearxngSearchProvider(config, fetchImpl);
    case "opensearch":
      return createOpensearchSearchProvider(config, fetchImpl);
    case "none":
    default:
      return undefined;
  }
}

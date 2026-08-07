/**
 * Env resolution for clawql-web providers.
 *
 * @see docs/web/clawql-web.md
 */

import type { WebBrowserProviderId, WebSearchProviderId } from "./interfaces.js";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

function parseSearchProvider(raw: string | undefined): WebSearchProviderId {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "none" || v === "off" || v === "0") return "none";
  if (v === "tavily" || v === "brave" || v === "searxng" || v === "opensearch") return v;
  throw new Error(
    `Unknown CLAWQL_WEB_SEARCH_PROVIDER=${raw} (expected tavily|brave|searxng|opensearch|none)`
  );
}

function parseBrowserProvider(raw: string | undefined): WebBrowserProviderId {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "none" || v === "off" || v === "0") return "none";
  if (
    v === "kitesurf" ||
    v === "chromium" ||
    v === "playwright" ||
    v === "puppeteer" ||
    v === "firecrawl"
  ) {
    return v;
  }
  throw new Error(
    `Unknown CLAWQL_WEB_BROWSER_PROVIDER=${raw} (expected kitesurf|chromium|playwright|puppeteer|firecrawl|none)`
  );
}

export type WebConfig = {
  searchProvider: WebSearchProviderId;
  browserProvider: WebBrowserProviderId;
  /** When search provider is none, fall back to browser-as-search (default true). */
  searchFallbackToBrowser: boolean;
  dryRun: boolean;
  tavilyApiKey?: string;
  braveApiKey?: string;
  searxngUrl?: string;
  opensearchUrl?: string;
  opensearchIndex?: string;
  firecrawlApiKey?: string;
  firecrawlBaseUrl?: string;
  /** Cloudflare Browser Run / Browser Rendering token for Kitesurf & Chromium. */
  browserRunApiToken?: string;
  cloudflareAccountId?: string;
  /** Self-hosted Chromium CDP endpoint (ws://…). */
  chromiumCdpUrl?: string;
  defaultSearchLimit: number;
};

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  let searchProvider: WebSearchProviderId;
  let browserProvider: WebBrowserProviderId;
  try {
    searchProvider = parseSearchProvider(env.CLAWQL_WEB_SEARCH_PROVIDER);
  } catch {
    searchProvider = "none";
  }
  try {
    browserProvider = parseBrowserProvider(env.CLAWQL_WEB_BROWSER_PROVIDER);
  } catch {
    browserProvider = "none";
  }

  // Implicit defaults: Tavily if key set; Kitesurf if Browser Run token set
  if (searchProvider === "none" && env.CLAWQL_TAVILY_API_KEY?.trim()) {
    searchProvider = "tavily";
  }
  if (browserProvider === "none" && env.CLAWQL_BROWSER_RUN_API_TOKEN?.trim()) {
    browserProvider = "kitesurf";
  }
  if (browserProvider === "none" && env.CLAWQL_FIRECRAWL_API_KEY?.trim()) {
    browserProvider = "firecrawl";
  }

  return {
    searchProvider,
    browserProvider,
    searchFallbackToBrowser: !envTruthy(env.CLAWQL_WEB_SEARCH_FALLBACK_DISABLED),
    dryRun: envTruthy(env.CLAWQL_WEB_DRY_RUN),
    tavilyApiKey: env.CLAWQL_TAVILY_API_KEY?.trim() || undefined,
    braveApiKey: env.CLAWQL_BRAVE_API_KEY?.trim() || undefined,
    searxngUrl: env.CLAWQL_SEARXNG_URL?.trim() || undefined,
    opensearchUrl: env.CLAWQL_OPENSEARCH_URL?.trim() || undefined,
    opensearchIndex: env.CLAWQL_OPENSEARCH_INDEX?.trim() || "clawql-web",
    firecrawlApiKey: env.CLAWQL_FIRECRAWL_API_KEY?.trim() || undefined,
    firecrawlBaseUrl: env.CLAWQL_FIRECRAWL_BASE_URL?.trim() || "https://api.firecrawl.dev",
    browserRunApiToken: env.CLAWQL_BROWSER_RUN_API_TOKEN?.trim() || undefined,
    cloudflareAccountId:
      env.CLAWQL_CLOUDFLARE_ACCOUNT_ID?.trim() || env.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined,
    chromiumCdpUrl: env.CLAWQL_CHROMIUM_CDP_URL?.trim() || undefined,
    defaultSearchLimit: Math.max(
      1,
      Number.parseInt(env.CLAWQL_WEB_SEARCH_LIMIT?.trim() || "5", 10) || 5
    ),
  };
}

/**
 * Whether the web plugin should register MCP tools.
 * Explicit `CLAWQL_ENABLE_WEB=0` wins; otherwise on when ENABLE_WEB=1 or any provider configured.
 */
export function isWebEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ENABLE_WEB?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  const cfg = loadWebConfig(env);
  return cfg.searchProvider !== "none" || cfg.browserProvider !== "none";
}

/** True when env suggests web should be on (for clawql-api optional flags without importing providers). */
export function envImpliesWebEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ENABLE_WEB?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  const search = env.CLAWQL_WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  const browser = env.CLAWQL_WEB_BROWSER_PROVIDER?.trim().toLowerCase();
  if (search && search !== "none" && search !== "off" && search !== "0") return true;
  if (browser && browser !== "none" && browser !== "off" && browser !== "0") return true;
  if (env.CLAWQL_TAVILY_API_KEY?.trim()) return true;
  if (env.CLAWQL_BRAVE_API_KEY?.trim()) return true;
  if (env.CLAWQL_SEARXNG_URL?.trim()) return true;
  if (env.CLAWQL_OPENSEARCH_URL?.trim()) return true;
  if (env.CLAWQL_FIRECRAWL_API_KEY?.trim()) return true;
  if (env.CLAWQL_BROWSER_RUN_API_TOKEN?.trim()) return true;
  return false;
}

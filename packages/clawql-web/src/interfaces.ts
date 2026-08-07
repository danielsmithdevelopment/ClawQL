/**
 * Provider interfaces for external web access.
 * Search (query → results) and browser/fetch (URL → content) are separate so
 * operators can mix providers (e.g. Brave search + Kitesurf fetch).
 */

export type SearchOptions = {
  /** Max results (provider may clamp). */
  limit?: number;
  /** ISO language / region hints when supported. */
  language?: string;
  /** Opaque correlation id for audit. */
  correlationId?: string;
};

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  source?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  provider: string;
  /** True when search fell back to browser-as-search. */
  fallback?: boolean;
  fallbackReason?: string;
};

export interface WebSearchProvider {
  readonly id: string;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
}

export type FetchOptions = {
  /** Prefer markdown / text extraction when provider supports it. */
  format?: "markdown" | "html" | "text";
  /**
   * When true, return raw response bytes + content-type (IDP / pdf-inspector path).
   * Uses the clawql-web direct HTTPS fetcher with IDP-parity SSRF/redirect/timeout caps —
   * not the markdown-converting browser provider.
   */
  raw?: boolean;
  timeoutMs?: number;
  correlationId?: string;
};

export type PageContent = {
  url: string;
  title?: string;
  markdown?: string;
  html?: string;
  text?: string;
  /** Present when `FetchOptions.raw` was true. */
  bytes?: Uint8Array;
  contentType?: string | null;
  finalUrl?: string;
  provider: string;
};

export type BrowserStep =
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string }
  | { action: "wait"; ms: number }
  | { action: "navigate"; url: string };

export type BrowserCapabilities = {
  fetch: boolean;
  screenshot: boolean;
  interact: boolean;
};

export interface WebBrowserProvider {
  readonly id: string;
  readonly capabilities: BrowserCapabilities;
  fetch(url: string, options?: FetchOptions): Promise<PageContent>;
  screenshot?(url: string, options?: FetchOptions): Promise<Uint8Array>;
  interact?(url: string, steps: BrowserStep[], options?: FetchOptions): Promise<PageContent>;
}

export type WebSearchProviderId =
  | "tavily"
  | "brave"
  | "searxng"
  | "opensearch"
  | "none";

export type WebBrowserProviderId =
  | "kitesurf"
  | "chromium"
  | "playwright"
  | "puppeteer"
  | "firecrawl"
  | "none";

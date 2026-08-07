import type {
  BrowserCapabilities,
  BrowserStep,
  FetchOptions,
  PageContent,
  WebBrowserProvider,
} from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

const CAPS: BrowserCapabilities = { fetch: true, screenshot: false, interact: false };

/**
 * Firecrawl managed scrape API — clean markdown for LLM consumption.
 */
export function createFirecrawlBrowserProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebBrowserProvider {
  return {
    id: "firecrawl",
    capabilities: CAPS,
    async fetch(url: string, options?: FetchOptions): Promise<PageContent> {
      if (config.dryRun || !config.firecrawlApiKey) {
        if (!config.dryRun && !config.firecrawlApiKey) {
          throw new Error("Firecrawl requires CLAWQL_FIRECRAWL_API_KEY (or CLAWQL_WEB_DRY_RUN=1)");
        }
        return {
          url,
          title: "[dry-run] firecrawl",
          markdown: `# Dry-run Firecrawl\n\n${url}`,
          text: `Dry-run ${url}`,
          provider: "firecrawl",
        };
      }
      const base = (config.firecrawlBaseUrl ?? "https://api.firecrawl.dev").replace(/\/$/, "");
      const res = await fetchImpl(`${base}/v1/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.firecrawlApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: [options?.format === "html" ? "html" : "markdown"],
        }),
        signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      });
      if (!res.ok) {
        throw new Error(`Firecrawl scrape failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: { markdown?: string; html?: string; metadata?: { title?: string } };
      };
      return {
        url,
        title: body.data?.metadata?.title,
        markdown: body.data?.markdown,
        html: body.data?.html,
        text: body.data?.markdown ?? body.data?.html,
        provider: "firecrawl",
      };
    },
    async screenshot(_url: string): Promise<Uint8Array> {
      throw new Error("Firecrawl screenshot not implemented in clawql-web v1 — use Kitesurf/Chromium");
    },
    async interact(
      _url: string,
      _steps: BrowserStep[]
    ): Promise<PageContent> {
      throw new Error("Firecrawl interact not implemented — use chromium/playwright");
    },
  };
}

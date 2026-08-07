import type {
  BrowserCapabilities,
  BrowserStep,
  FetchOptions,
  PageContent,
  WebBrowserProvider,
} from "../../interfaces.js";
import type { WebConfig } from "../../config.js";

const CAPS: BrowserCapabilities = { fetch: true, screenshot: true, interact: false };

/**
 * Kitesurf via Cloudflare Browser Run / Browser Rendering (free beta).
 * Uses the Cloudflare account Browser Rendering REST API when token+account are set.
 */
export function createKitesurfBrowserProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebBrowserProvider {
  return {
    id: "kitesurf",
    capabilities: CAPS,
    async fetch(url: string, options?: FetchOptions): Promise<PageContent> {
      if (config.dryRun || !config.browserRunApiToken || !config.cloudflareAccountId) {
        if (!config.dryRun && (!config.browserRunApiToken || !config.cloudflareAccountId)) {
          throw new Error(
            "Kitesurf requires CLAWQL_BROWSER_RUN_API_TOKEN + CLAWQL_CLOUDFLARE_ACCOUNT_ID (or CLAWQL_WEB_DRY_RUN=1)"
          );
        }
        return {
          url,
          title: "[dry-run] kitesurf",
          markdown: `# Dry-run fetch\n\nURL: ${url}\n\nSet Browser Run credentials for live Kitesurf.`,
          text: `Dry-run content for ${url}`,
          provider: "kitesurf",
        };
      }

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/browser-rendering/markdown`;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.browserRunApiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url }),
        signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      });
      if (!res.ok) {
        throw new Error(`Kitesurf fetch failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as { result?: string; success?: boolean };
      const markdown = typeof body.result === "string" ? body.result : JSON.stringify(body);
      return { url, markdown, text: markdown, provider: "kitesurf" };
    },
    async screenshot(url: string, options?: FetchOptions): Promise<Uint8Array> {
      if (config.dryRun || !config.browserRunApiToken || !config.cloudflareAccountId) {
        if (!config.dryRun && (!config.browserRunApiToken || !config.cloudflareAccountId)) {
          throw new Error("Kitesurf screenshot requires Browser Run credentials");
        }
        return new TextEncoder().encode(`dry-run-screenshot:${url}`);
      }
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/browser-rendering/screenshot`;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.browserRunApiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url }),
        signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      });
      if (!res.ok) {
        throw new Error(`Kitesurf screenshot failed: HTTP ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
    async interact(
      _url: string,
      _steps: BrowserStep[],
      _options?: FetchOptions
    ): Promise<PageContent> {
      throw new Error("Kitesurf provider does not support web_interact yet — use chromium/playwright");
    },
  };
}

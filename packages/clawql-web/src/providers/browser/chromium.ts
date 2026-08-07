import type {
  BrowserCapabilities,
  BrowserStep,
  FetchOptions,
  PageContent,
  WebBrowserProvider,
} from "../../interfaces.js";
import type { WebConfig } from "../../config.js";
import { cdpInteract, cdpNavigateAndGetContent, cdpScreenshot } from "./cdp.js";

const CAPS: BrowserCapabilities = { fetch: true, screenshot: true, interact: true };

/**
 * Chromium via CDP URL or Cloudflare Browser Run.
 * Playwright/Puppeteer ids share this backend (same CDP path).
 */
export function createChromiumBrowserProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch,
  variant: "chromium" | "playwright" | "puppeteer" = "chromium"
): WebBrowserProvider {
  return {
    id: variant,
    capabilities: CAPS,
    async fetch(url: string, options?: FetchOptions): Promise<PageContent> {
      if (config.dryRun) {
        return {
          url,
          title: `[dry-run] ${variant}`,
          markdown: `# Dry-run ${variant}\n\n${url}\n\nConnect CDP or Browser Run for live browsing.`,
          text: `Dry-run ${url}`,
          provider: variant,
        };
      }

      // Prefer Browser Run markdown endpoint when available
      if (config.browserRunApiToken && config.cloudflareAccountId) {
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
          throw new Error(`${variant} (Browser Run) fetch failed: HTTP ${res.status}`);
        }
        const body = (await res.json()) as { result?: string };
        const markdown = typeof body.result === "string" ? body.result : "";
        return { url, markdown, text: markdown, provider: variant };
      }

      if (config.chromiumCdpUrl) {
        return cdpNavigateAndGetContent(config.chromiumCdpUrl, url, {
          timeoutMs: options?.timeoutMs,
          fetchImpl,
          providerId: variant,
        });
      }

      throw new Error(
        `${variant}: set CLAWQL_CHROMIUM_CDP_URL or CLAWQL_BROWSER_RUN_API_TOKEN + account id (or CLAWQL_WEB_DRY_RUN=1)`
      );
    },
    async screenshot(url: string, options?: FetchOptions): Promise<Uint8Array> {
      if (config.dryRun) {
        return new TextEncoder().encode(`dry-run-${variant}-screenshot:${url}`);
      }
      if (config.chromiumCdpUrl) {
        return cdpScreenshot(config.chromiumCdpUrl, url, {
          timeoutMs: options?.timeoutMs,
          fetchImpl,
        });
      }
      throw new Error(
        `${variant} screenshot requires CLAWQL_CHROMIUM_CDP_URL (or CLAWQL_WEB_DRY_RUN=1)`
      );
    },
    async interact(
      url: string,
      steps: BrowserStep[],
      options?: FetchOptions
    ): Promise<PageContent> {
      if (config.dryRun) {
        return {
          url,
          title: `[dry-run] ${variant} interact`,
          markdown: `Steps: ${JSON.stringify(steps)}`,
          text: `interact dry-run ${url}`,
          provider: variant,
        };
      }
      if (config.chromiumCdpUrl) {
        return cdpInteract(config.chromiumCdpUrl, url, steps, {
          timeoutMs: options?.timeoutMs,
          fetchImpl,
          providerId: variant,
        });
      }
      throw new Error(
        `${variant} interact requires CLAWQL_CHROMIUM_CDP_URL (or CLAWQL_WEB_DRY_RUN=1)`
      );
    },
  };
}

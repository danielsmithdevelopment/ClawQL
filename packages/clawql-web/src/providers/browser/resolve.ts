import type { WebConfig } from "../../config.js";
import type { WebBrowserProvider } from "../../interfaces.js";
import { createKitesurfBrowserProvider } from "./kitesurf.js";
import { createFirecrawlBrowserProvider } from "./firecrawl.js";
import { createChromiumBrowserProvider } from "./chromium.js";

export function resolveBrowserProvider(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): WebBrowserProvider | undefined {
  switch (config.browserProvider) {
    case "kitesurf":
      return createKitesurfBrowserProvider(config, fetchImpl);
    case "firecrawl":
      return createFirecrawlBrowserProvider(config, fetchImpl);
    case "chromium":
      return createChromiumBrowserProvider(config, fetchImpl, "chromium");
    case "playwright":
      return createChromiumBrowserProvider(config, fetchImpl, "playwright");
    case "puppeteer":
      return createChromiumBrowserProvider(config, fetchImpl, "puppeteer");
    case "none":
    default:
      return undefined;
  }
}

/**
 * Optional live CDP smoke — skipped unless CLAWQL_CHROMIUM_CDP_URL is set.
 * Run: CLAWQL_CHROMIUM_CDP_URL=http://127.0.0.1:9222 npm test -w clawql-web -- src/cdp.live.test.ts
 */

import { describe, expect, it } from "vitest";
import { createWebService, resolveCdpWebSocketUrl } from "./index.js";

const cdpUrl = process.env.CLAWQL_CHROMIUM_CDP_URL?.trim();

describe.runIf(Boolean(cdpUrl))("clawql-web live CDP", () => {
  it("resolves http CDP endpoint to a websocket debugger URL", async () => {
    const ws = await resolveCdpWebSocketUrl(cdpUrl!);
    expect(ws.startsWith("ws://") || ws.startsWith("wss://")).toBe(true);
  });

  it("fetches and screenshots via chromium provider", async () => {
    const web = createWebService({
      ...process.env,
      CLAWQL_WEB_BROWSER_PROVIDER: "chromium",
      CLAWQL_CHROMIUM_CDP_URL: cdpUrl,
      CLAWQL_WEB_DRY_RUN: "0",
      CLAWQL_WEB_SEARCH_PROVIDER: "none",
    });
    const page = await web.fetch("https://example.com", { timeoutMs: 30_000 });
    expect(page.provider).toBe("chromium");
    expect((page.text ?? page.markdown ?? "").length).toBeGreaterThan(0);

    const shot = await web.screenshot("https://example.com", { timeoutMs: 30_000 });
    expect(shot.byteLength).toBeGreaterThan(100);
  }, 60_000);
});

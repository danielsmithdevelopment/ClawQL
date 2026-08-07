import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WebCapabilityError,
  createWebService,
  envImpliesWebEnabled,
  isWebEnabled,
  listWebAuditEvents,
  loadWebConfig,
  resetWebAuditForTests,
} from "./index.js";

describe("clawql-web", () => {
  beforeEach(() => {
    resetWebAuditForTests();
    delete process.env.CLAWQL_ENABLE_WEB;
    delete process.env.CLAWQL_WEB_SEARCH_PROVIDER;
    delete process.env.CLAWQL_WEB_BROWSER_PROVIDER;
    delete process.env.CLAWQL_TAVILY_API_KEY;
    delete process.env.CLAWQL_BROWSER_RUN_API_TOKEN;
    delete process.env.CLAWQL_CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLAWQL_WEB_DRY_RUN;
    delete process.env.CLAWQL_WEB_SEARCH_FALLBACK_DISABLED;
  });

  afterEach(() => {
    resetWebAuditForTests();
  });

  it("loadWebConfig defaults to none/none", () => {
    const cfg = loadWebConfig({});
    expect(cfg.searchProvider).toBe("none");
    expect(cfg.browserProvider).toBe("none");
  });

  it("implicitly selects tavily/kitesurf from credentials", () => {
    const cfg = loadWebConfig({
      CLAWQL_TAVILY_API_KEY: "tvly-test",
      CLAWQL_BROWSER_RUN_API_TOKEN: "cf-token",
    });
    expect(cfg.searchProvider).toBe("tavily");
    expect(cfg.browserProvider).toBe("kitesurf");
  });

  it("envImpliesWebEnabled follows keys and explicit off", () => {
    expect(envImpliesWebEnabled({})).toBe(false);
    expect(envImpliesWebEnabled({ CLAWQL_TAVILY_API_KEY: "x" })).toBe(true);
    expect(
      envImpliesWebEnabled({ CLAWQL_ENABLE_WEB: "0", CLAWQL_TAVILY_API_KEY: "x" })
    ).toBe(false);
  });

  it("fallback chain: no search provider → audit then browser-as-search", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    process.env.CLAWQL_WEB_SEARCH_PROVIDER = "none";

    const web = createWebService(process.env);
    expect(isWebEnabled(process.env)).toBe(true);
    expect(web.searchProvider).toBeUndefined();
    expect(web.browserProvider?.id).toBe("kitesurf");

    const result = await web.search("clawql agentic gateway");
    expect(result.fallback).toBe(true);
    expect(result.provider).toMatch(/^browser:/);
    expect(result.results.length).toBeGreaterThan(0);

    const events = listWebAuditEvents();
    const fallbackIdx = events.findIndex((e) => e.type === "WEB_SEARCH_FALLBACK");
    const searchIdx = events.findIndex((e) => e.type === "WEB_SEARCH" && e.detail === "fallback");
    expect(fallbackIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeGreaterThan(fallbackIdx);
    expect(events[fallbackIdx]?.reason).toBe("no_search_provider_configured");
    expect(events[fallbackIdx]?.fallback).toBe("browser");
    expect(events[fallbackIdx]?.provider).toBe("kitesurf");
  });

  it("WEB_SEARCH_FALLBACK audit is written even when browser fallback fails", async () => {
    // No dry-run and no Browser Run credentials → kitesurf fetch throws
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_SEARCH_PROVIDER = "none";

    const web = createWebService(process.env);
    await expect(web.search("regulated query")).rejects.toThrow(/Kitesurf requires/i);

    const events = listWebAuditEvents();
    const fallback = events.find((e) => e.type === "WEB_SEARCH_FALLBACK");
    expect(fallback).toBeDefined();
    expect(fallback?.reason).toBe("no_search_provider_configured");
    expect(fallback?.provider).toBe("kitesurf");
    expect(events.some((e) => e.type === "WEB_ERROR" && e.reason === "browser_fallback_failed")).toBe(
      true
    );
    // Fallback must precede the error (WORM order)
    const fallbackIdx = events.findIndex((e) => e.type === "WEB_SEARCH_FALLBACK");
    const errorIdx = events.findIndex((e) => e.type === "WEB_ERROR");
    expect(fallbackIdx).toBeLessThan(errorIdx);
  });

  it("tavily dry-run search records WEB_SEARCH without fallback", async () => {
    process.env.CLAWQL_WEB_SEARCH_PROVIDER = "tavily";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    const web = createWebService(process.env);
    const result = await web.search("test query", { limit: 1 });
    expect(result.provider).toBe("tavily");
    expect(result.fallback).toBeUndefined();
    expect(listWebAuditEvents().some((e) => e.type === "WEB_SEARCH_FALLBACK")).toBe(false);
  });

  it("web_fetch uses kitesurf dry-run", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    const web = createWebService(process.env);
    const page = await web.fetch("https://example.com");
    expect(page.provider).toBe("kitesurf");
    expect(page.markdown).toMatch(/example.com/);
    expect(listWebAuditEvents().some((e) => e.type === "WEB_FETCH" && e.ok)).toBe(true);
  });

  it("web_fetch raw=true returns bytes + content-type without a browser provider", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "none";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    const web = createWebService(process.env);
    expect(web.browserProvider).toBeUndefined();

    const page = await web.fetch("https://example.com/report.pdf", { raw: true });
    expect(page.provider).toBe("raw-http");
    expect(page.bytes).toBeInstanceOf(Uint8Array);
    expect(page.bytes!.byteLength).toBeGreaterThan(0);
    expect(page.contentType).toMatch(/text\/plain/);
    expect(page.finalUrl).toBe("https://example.com/report.pdf");
    expect(listWebAuditEvents().some((e) => e.type === "WEB_FETCH" && e.detail === "raw")).toBe(
      true
    );
  });

  it("web_screenshot with no browser provider returns structured WebCapabilityError", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "none";
    const web = createWebService(process.env);
    expect(web.browserProvider).toBeUndefined();

    try {
      await web.screenshot("https://example.com");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WebCapabilityError);
      const e = err as WebCapabilityError;
      expect(e.code).toBe("NO_BROWSER_PROVIDER");
      expect(e.reason).toMatch(/No browser provider/i);
      expect(e.toJSON().error).toMatchObject({ code: "NO_BROWSER_PROVIDER" });
    }
  });

  it("screenshot capability error is structured for unsupported providers", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "firecrawl";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    const web = createWebService(process.env);
    await expect(web.screenshot("https://example.com")).rejects.toMatchObject({
      name: "WebCapabilityError",
      code: "CAPABILITY_UNSUPPORTED",
      capability: "screenshot",
      provider: "firecrawl",
    });
  });

  it("disabling fallback fails closed when no search provider", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    process.env.CLAWQL_WEB_SEARCH_FALLBACK_DISABLED = "1";
    const web = createWebService(process.env);
    await expect(web.search("x")).rejects.toMatchObject({
      name: "WebCapabilityError",
      code: "NO_SEARCH_PROVIDER",
    });
  });
});

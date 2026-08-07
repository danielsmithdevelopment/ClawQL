import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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

  it("search falls back to browser with audit before execute", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    process.env.CLAWQL_WEB_SEARCH_PROVIDER = "none";

    const web = createWebService(process.env);
    expect(isWebEnabled(process.env)).toBe(true);

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

  it("screenshot capability error is clear for unsupported paths", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "firecrawl";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    const web = createWebService(process.env);
    await expect(web.screenshot("https://example.com")).rejects.toThrow(/does not support screenshot/i);
  });

  it("disabling fallback fails closed when no search provider", async () => {
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    process.env.CLAWQL_WEB_SEARCH_FALLBACK_DISABLED = "1";
    const web = createWebService(process.env);
    await expect(web.search("x")).rejects.toThrow(/No web search provider/i);
  });
});

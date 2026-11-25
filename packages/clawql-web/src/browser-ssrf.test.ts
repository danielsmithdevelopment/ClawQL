import { describe, expect, it } from "vitest";
import { assertSafeWebUrl } from "./providers/browser/raw-fetch.js";
import { createWebService } from "./service.js";
import { resetWebAuditForTests } from "./index.js";

describe("browser URL SSRF gate (audit 5.01)", () => {
  it("assertSafeWebUrl blocks file:// and metadata hosts", () => {
    expect(() => assertSafeWebUrl("file:///etc/passwd")).toThrow();
    expect(() => assertSafeWebUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertSafeWebUrl("http://127.0.0.1/")).toThrow(/loopback/i);
  });

  it("web_fetch browser path rejects unsafe URLs before provider", async () => {
    resetWebAuditForTests();
    process.env.CLAWQL_WEB_BROWSER_PROVIDER = "kitesurf";
    process.env.CLAWQL_WEB_DRY_RUN = "1";
    delete process.env.CLAWQL_WEB_ALLOW_LOOPBACK;
    const web = createWebService(process.env);
    await expect(web.fetch("file:///etc/passwd")).rejects.toThrow();
    await expect(web.screenshot("http://169.254.169.254/")).rejects.toThrow();
    await expect(
      web.interact("https://example.com", [{ action: "navigate", url: "file:///tmp/x" }])
    ).rejects.toThrow();
  });
});

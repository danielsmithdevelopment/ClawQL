import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildConsoleLink,
  buildConsoleLinkEffect,
  consoleLinkEnabled,
  resolveConsoleBaseUrl,
} from "./console-link.js";

describe("console_link", () => {
  it("defaults base URL to clawql.com/console", () => {
    expect(resolveConsoleBaseUrl({})).toBe("https://clawql.com/console");
  });

  it("prefers CLAWQL_CONSOLE_BASE_URL then PUBLIC_ORIGIN", () => {
    expect(resolveConsoleBaseUrl({ CLAWQL_CONSOLE_BASE_URL: "https://example.com/ui/" })).toBe(
      "https://example.com/ui"
    );
    expect(resolveConsoleBaseUrl({ CLAWQL_PUBLIC_ORIGIN: "https://app.example.com" })).toBe(
      "https://app.example.com/console"
    );
  });

  it("builds deep link with session and org query params", async () => {
    const result = await Effect.runPromise(
      buildConsoleLinkEffect({ path: "activity/pex_1", sessionId: "mcp-sess", orgId: "org-9" }, {})
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("activity/pex_1");
    expect(result.sessionId).toBe("mcp-sess");
    expect(result.orgId).toBe("org-9");
    expect(result.url).toContain("/console/activity/pex_1");
    expect(result.url).toContain("sessionId=mcp-sess");
    expect(result.url).toContain("orgId=org-9");
  });

  it("sync façade matches Effect", () => {
    const env = { CLAWQL_CONSOLE_BASE_URL: "https://x.test/console" };
    const input = { path: "overview", sessionId: "s" };
    expect(buildConsoleLink(input, env)).toEqual(
      Effect.runSync(buildConsoleLinkEffect(input, env))
    );
  });

  it("flag defaults off", () => {
    expect(consoleLinkEnabled({})).toBe(false);
    expect(consoleLinkEnabled({ CLAWQL_ENABLE_CONSOLE_LINK: "1" })).toBe(true);
  });
});

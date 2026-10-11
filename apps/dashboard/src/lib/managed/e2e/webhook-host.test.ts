import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { isPrivateIp, isRebindHostname, looksLikeDecimalIp, webhookHostRefused } from "./webhook-host";
import { resetWorld } from "./world";

describe("webhook host SSRF / rebind", () => {
  it("classifies loopback, link-local, and IPv6-mapped as private", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("treats decimal and rebind-style names as refused classes", () => {
    expect(looksLikeDecimalIp("2130706433")).toBe(true);
    expect(isRebindHostname("rebind.to.private.test")).toBe(true);
    expect(isRebindHostname("metadata.google.internal")).toBe(true);
    expect(isRebindHostname("hooks.example.com")).toBe(false);
  });

  it("refuses private, decimal, mapped, and rebind hosts even on a fresh world", async () => {
    resetWorld();
    const cases: [string, string][] = [
      ["127.0.0.1", "private"],
      ["169.254.169.254", "private"],
      ["2130706433", "decimal"],
      ["::ffff:127.0.0.1", "private"],
      ["rebind.to.private.test", "rebind"],
    ];
    for (const [host, kind] of cases) {
      const reason = await Effect.runPromise(webhookHostRefused(host));
      expect(reason, host).toBeTruthy();
      expect(String(reason).toLowerCase()).toContain(kind);
    }
  });
});

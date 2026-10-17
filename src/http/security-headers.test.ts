import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSecurityHeadersEffect,
  hstsEnabled,
  securityHeadersEnabled,
} from "./security-headers.js";

describe("security headers", () => {
  const prevHeaders = process.env.CLAWQL_SECURITY_HEADERS;
  const prevHsts = process.env.CLAWQL_HSTS;

  afterEach(() => {
    if (prevHeaders === undefined) delete process.env.CLAWQL_SECURITY_HEADERS;
    else process.env.CLAWQL_SECURITY_HEADERS = prevHeaders;
    if (prevHsts === undefined) delete process.env.CLAWQL_HSTS;
    else process.env.CLAWQL_HSTS = prevHsts;
  });

  it("builds CSP and baseline headers without HSTS by default", async () => {
    const h = await Effect.runPromise(buildSecurityHeadersEffect());
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Strict-Transport-Security"]).toBeUndefined();
  });

  it("adds HSTS when enabled", async () => {
    const h = await Effect.runPromise(buildSecurityHeadersEffect({ enableHsts: true }));
    expect(h["Strict-Transport-Security"]).toContain("max-age=63072000");
  });

  it("respects CLAWQL_SECURITY_HEADERS=0 and CLAWQL_HSTS=1", () => {
    process.env.CLAWQL_SECURITY_HEADERS = "0";
    expect(securityHeadersEnabled()).toBe(false);
    delete process.env.CLAWQL_SECURITY_HEADERS;
    expect(securityHeadersEnabled()).toBe(true);
    process.env.CLAWQL_HSTS = "1";
    expect(hstsEnabled()).toBe(true);
  });
});

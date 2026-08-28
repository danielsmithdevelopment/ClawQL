import { describe, expect, it } from "vitest";

import { verifyJwt, signJwt } from "./jwt.js";
import { validatePayload } from "./schema.js";
import { checkRateLimit, parseAllowedOrigins } from "./rate-limit.js";
import type { JwtClaims } from "./types.js";

const secret = "test-signing-key-at-least-32-chars-long";

const baseClaims = (): JwtClaims => ({
  sub: "session-abc",
  project: "clawql-local",
  origin: "http://localhost:3000",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

describe("faro worker jwt", () => {
  it("round-trips HS256 claims", async () => {
    const token = await signJwt(baseClaims(), secret);
    const claims = await verifyJwt(token, secret);
    expect(claims?.sub).toBe("session-abc");
    expect(claims?.project).toBe("clawql-local");
  });

  it("rejects expired tokens", async () => {
    const token = await signJwt({ ...baseClaims(), exp: 1 }, secret);
    expect(await verifyJwt(token, secret)).toBeNull();
  });
});

describe("faro worker schema", () => {
  it("accepts a single exception event", () => {
    const body = { type: "exception", payload: { exceptions: [] } };
    const raw = JSON.stringify(body);
    const result = validatePayload(body, 65536, raw.length);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown event types", () => {
    const body = { type: "malicious" };
    const raw = JSON.stringify(body);
    expect(validatePayload(body, 65536, raw.length)).toEqual({
      ok: false,
      reason: "unexpected_event_type",
    });
  });
});

describe("faro worker rate limit", () => {
  it("allows burst then blocks within the rolling minute", () => {
    const buckets = new Map<string, { count: number; resetAt: number }>();
    expect(checkRateLimit(buckets, "s1", 2, 1_000)).toBe(true);
    expect(checkRateLimit(buckets, "s1", 2, 1_100)).toBe(true);
    expect(checkRateLimit(buckets, "s1", 2, 1_200)).toBe(false);
  });
});

describe("faro worker origins", () => {
  it("parses comma-separated allowlist", () => {
    const allowed = parseAllowedOrigins("https://a.test, https://b.test");
    expect(allowed.has("https://a.test")).toBe(true);
    expect(allowed.has("https://b.test")).toBe(true);
  });
});

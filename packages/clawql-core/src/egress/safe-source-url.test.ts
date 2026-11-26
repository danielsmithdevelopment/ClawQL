import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
} from "./safe-source-url.js";

describe("egress safe-source-url (audit 5.07)", () => {
  it("blocks private and loopback literal hosts", () => {
    expect(() => assertSafeSourceFetchUrl("https://127.0.0.1/x")).toThrow();
    expect(() => assertSafeSourceFetchUrl("https://localhost/x")).toThrow();
    expect(() => assertSafeSourceFetchUrl("https://[::ffff:7f00:1]/x")).toThrow();
    expect(assertSafeSourceFetchUrl("https://example.com/x").hostname).toBe("example.com");
  });

  it("regulated ignores CLAWQL_SOURCES_ALLOW_HTTP for cleartext URLs", () => {
    const prevTier = process.env.CLAWQL_TIER;
    const prevAllow = process.env.CLAWQL_SOURCES_ALLOW_HTTP;
    process.env.CLAWQL_TIER = "regulated";
    process.env.CLAWQL_SOURCES_ALLOW_HTTP = "1";
    try {
      expect(() => assertSafeSourceFetchUrl("http://example.com/x")).toThrow(/HTTPS/i);
    } finally {
      if (prevTier === undefined) delete process.env.CLAWQL_TIER;
      else process.env.CLAWQL_TIER = prevTier;
      if (prevAllow === undefined) delete process.env.CLAWQL_SOURCES_ALLOW_HTTP;
      else process.env.CLAWQL_SOURCES_ALLOW_HTTP = prevAllow;
    }
  });

  it("detects IPv4-mapped and private ranges", () => {
    expect(expandIpv4MappedIpv6("::ffff:7f00:1")).toBe("127.0.0.1");
    expect(isPrivateOrLoopbackIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false);
  });

  it("Effect wrapper fails closed on private literals", async () => {
    const exit = await Effect.runPromiseExit(
      assertSafeSourceFetchUrlResolvedEffect("https://192.168.1.1/openapi.json")
    );
    expect(exit._tag).toBe("Failure");
  });
});

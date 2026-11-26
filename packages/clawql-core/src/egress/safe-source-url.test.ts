import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
} from "./safe-source-url.js";

describe("egress safe-source-url (audit 5.07 scaffold)", () => {
  it("blocks private and loopback literal hosts", () => {
    expect(() => assertSafeSourceFetchUrl("https://127.0.0.1/x")).toThrow();
    expect(() => assertSafeSourceFetchUrl("https://localhost/x")).toThrow();
    expect(() => assertSafeSourceFetchUrl("https://[::ffff:7f00:1]/x")).toThrow();
    expect(assertSafeSourceFetchUrl("https://example.com/x").hostname).toBe("example.com");
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

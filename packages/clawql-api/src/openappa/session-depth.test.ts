import { describe, expect, it, beforeEach } from "vitest";
import { Effect } from "effect";
import { OPENAPPA_SUPPORTED_SESSION_CALLS } from "./config.js";
import {
  openAppaAlertLatencyBudgetExceededEffect,
  openAppaMaybeWarnSupportedLimitEffect,
  openAppaRecordSessionCallEffect,
  openAppaSessionDepthEffect,
  resetOpenAppaSessionDepthForTests,
} from "./session-depth.js";

describe("OpenAPPA session depth", () => {
  beforeEach(() => resetOpenAppaSessionDepthForTests());

  it("tracks per-root ordinal without cross-root bleed", async () => {
    expect(await Effect.runPromise(openAppaSessionDepthEffect("a"))).toBe(0);
    expect(await Effect.runPromise(openAppaRecordSessionCallEffect("a"))).toBe(1);
    expect(await Effect.runPromise(openAppaRecordSessionCallEffect("a"))).toBe(2);
    expect(await Effect.runPromise(openAppaRecordSessionCallEffect("b"))).toBe(1);
    expect(await Effect.runPromise(openAppaSessionDepthEffect("a"))).toBe(2);
  });

  it("emits supported-limit ALERT once when depth crosses the documented cap", async () => {
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string | Uint8Array, ...a: unknown[]) => {
      chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
      return (orig as (x: string | Uint8Array, ...y: unknown[]) => boolean)(c, ...a);
    }) as typeof process.stderr.write;
    try {
      await Effect.runPromise(
        openAppaMaybeWarnSupportedLimitEffect("lim", OPENAPPA_SUPPORTED_SESSION_CALLS)
      );
      await Effect.runPromise(
        openAppaMaybeWarnSupportedLimitEffect("lim", OPENAPPA_SUPPORTED_SESSION_CALLS + 10)
      );
      const text = chunks.join("");
      expect(text).toMatch(/ALERT: session exceeded supported OpenAPPA call count/);
      expect(text.match(/ALERT: session exceeded/g)?.length).toBe(1);
    } finally {
      process.stderr.write = orig;
    }
  });

  it("formats latency-budget ALERT with call N", async () => {
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string | Uint8Array, ...a: unknown[]) => {
      chunks.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
      return (orig as (x: string | Uint8Array, ...y: unknown[]) => boolean)(c, ...a);
    }) as typeof process.stderr.write;
    try {
      const msg = await Effect.runPromise(
        openAppaAlertLatencyBudgetExceededEffect("r1", 4321, 250)
      );
      expect(msg).toMatch(/policy latency exceeded budget at call 4321/);
      expect(chunks.join("")).toMatch(/ALERT: policy latency exceeded budget at call 4321/);
    } finally {
      process.stderr.write = orig;
    }
  });
});

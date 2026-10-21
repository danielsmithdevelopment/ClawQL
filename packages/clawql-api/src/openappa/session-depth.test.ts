import { describe, expect, it, beforeEach } from "vitest";
import { Effect } from "effect";
import {
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
});

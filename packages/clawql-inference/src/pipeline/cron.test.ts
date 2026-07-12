import { describe, expect, it } from "vitest";
import { cronMatchesUtc } from "./cron.js";

describe("cronMatchesUtc", () => {
  it("matches exact minute schedules", () => {
    const at = new Date("2026-07-12T02:00:00.000Z");
    expect(cronMatchesUtc("0 2 * * 0", at)).toBe(true);
    expect(cronMatchesUtc("0 3 * * 0", at)).toBe(false);
  });
});

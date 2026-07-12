import { describe, expect, it } from "vitest";
import { parseSinceDuration } from "./parse-since.js";

describe("parseSinceDuration", () => {
  it("parses hour and day windows", () => {
    const hour = parseSinceDuration("24h");
    expect(hour).toBeDefined();
    expect(Date.now() - hour!.getTime()).toBeGreaterThan(23 * 3_600_000);

    const week = parseSinceDuration("7d");
    expect(week).toBeDefined();
    expect(Date.now() - week!.getTime()).toBeGreaterThan(6 * 86_400_000);
  });

  it("returns undefined for invalid input", () => {
    expect(parseSinceDuration("")).toBeUndefined();
    expect(parseSinceDuration("nope")).toBeUndefined();
  });
});

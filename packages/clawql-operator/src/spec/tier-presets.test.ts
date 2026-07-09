import { describe, expect, it } from "vitest";
import { applyTierPreset } from "./tier-presets.js";

describe("applyTierPreset", () => {
  it("applies local preset with memory only", () => {
    const merged = applyTierPreset({ tier: "local" });
    expect(merged.memory?.enabled).toBe(true);
    expect(merged.documents?.enabled).toBe(false);
  });

  it("user override wins over preset", () => {
    const merged = applyTierPreset({
      tier: "local",
      documents: { enabled: true },
    });
    expect(merged.documents?.enabled).toBe(true);
  });

  it("defaults to standard when tier omitted", () => {
    const merged = applyTierPreset({});
    expect(merged.tier).toBe("standard");
    expect(merged.documents?.enabled).toBe(true);
  });

  it("enterprise enables workflow and onyx", () => {
    const merged = applyTierPreset({ tier: "enterprise" });
    expect(merged.documents?.onyx?.enabled).toBe(true);
    expect(merged.automation?.workflow?.enabled).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { CLAWQL_PLANS, getPlanDefinition, isClawqlPlanId } from "./tiers.js";

describe("CLAWQL_PLANS", () => {
  it("defines all managed tiers", () => {
    expect(Object.keys(CLAWQL_PLANS).sort()).toEqual(["enterprise", "free", "pro", "team"]);
  });

  it("free tier disables x402", () => {
    expect(getPlanDefinition("free").x402_enabled).toBe(false);
  });

  it("pro tier enables x402", () => {
    expect(getPlanDefinition("pro").x402_enabled).toBe(true);
  });

  it("validates plan ids", () => {
    expect(isClawqlPlanId("pro")).toBe(true);
    expect(isClawqlPlanId("invalid")).toBe(false);
  });
});

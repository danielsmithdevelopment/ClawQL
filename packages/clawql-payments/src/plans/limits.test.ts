import { describe, expect, it } from "vitest";
import { entitlementsFromPlan } from "./entitlements.js";
import { checkEntitlementLimit } from "./limits.js";
import type { MonthlyUsage } from "./usage.js";

describe("entitlement limits", () => {
  const entitlements = entitlementsFromPlan("free");
  const baseUsage: MonthlyUsage = {
    month: "2026-07",
    tenantId: "t1",
    planId: "free",
    inferenceCalls: 99,
    documents: 0,
    memoryMbPeak: 0,
  };

  it("allows usage under limit", () => {
    const result = checkEntitlementLimit({
      entitlements,
      usage: baseUsage,
      resource: "inference_calls",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks usage at limit", () => {
    const result = checkEntitlementLimit({
      entitlements,
      usage: { ...baseUsage, inferenceCalls: 100 },
      resource: "inference_calls",
    });
    expect(result.allowed).toBe(false);
  });

  it("enterprise has unlimited inference", () => {
    const enterprise = entitlementsFromPlan("enterprise");
    const result = checkEntitlementLimit({
      entitlements: enterprise,
      usage: { ...baseUsage, inferenceCalls: 1_000_000 },
      resource: "inference_calls",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeNull();
  });
});

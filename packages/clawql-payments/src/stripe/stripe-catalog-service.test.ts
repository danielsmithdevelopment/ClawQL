import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRIPE_CATALOG,
  ensureStripeCatalog,
  validateStripeCatalogEnv,
} from "./stripe-catalog-service.js";

describe("StripeCatalogService", () => {
  it("dry-run plans pro/team + top-ups + meter without Stripe key", async () => {
    const result = await ensureStripeCatalog({ dryRun: true }, {/* no STRIPE_SECRET_KEY */});
    expect(result.dryRun).toBe(true);
    expect(result.currency).toBe("usd");
    expect(result.plans.map((p) => p.planId)).toEqual(["pro", "team"]);
    expect(result.plans.every((p) => p.status === "planned")).toBe(true);
    expect(result.topUps).toHaveLength(DEFAULT_STRIPE_CATALOG.topUps.length);
    expect(result.meter.eventName).toBe("clawql_inference_overage");
    expect(result.envExports.some((l) => l.includes("STRIPE_PRO_PRICE_ID"))).toBe(true);
    expect(result.envExports.some((l) => l.includes("STRIPE_METER_EVENT_NAME"))).toBe(true);
  });

  it("dry-run can skip top-ups and meter", async () => {
    const result = await ensureStripeCatalog({
      dryRun: true,
      includeTopUps: false,
      includeMeter: false,
    });
    expect(result.topUps).toEqual([]);
    expect(result.envExports.every((l) => !l.includes("STRIPE_METER"))).toBe(true);
  });

  it("validateCatalogEnv reports missing price ids", () => {
    const v = validateStripeCatalogEnv({});
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.name === "STRIPE_PRO_PRICE_ID")?.ok).toBe(false);
    expect(v.checks.find((c) => c.name === "STRIPE_TEAM_PRICE_ID")?.ok).toBe(false);
  });

  it("validateCatalogEnv passes when subscription rail env is set", () => {
    const v = validateStripeCatalogEnv({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_TEAM_PRICE_ID: "price_team",
    });
    expect(v.ok).toBe(true);
    expect(v.checks.find((c) => c.name === "STRIPE_METER_EVENT_NAME")?.ok).toBe(false);
  });

  it("live ensure fails without STRIPE_SECRET_KEY", async () => {
    // Effect.runPromise wraps tagged errors in FiberFailure (name embeds the tag).
    await expect(ensureStripeCatalog({ dryRun: false }, {})).rejects.toMatchObject({
      name: expect.stringContaining("StripeNotConfigured"),
    });
  });
});

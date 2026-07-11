import { describe, expect, it } from "vitest";
import { ssmParameterPrefixForTenant, syncPrefixForTier } from "./tiers.js";

describe("syncPrefixForTier", () => {
  it("returns shared/ for shared tier", () => {
    expect(syncPrefixForTier("shared")).toBe("shared/");
  });

  it("returns tenant/{id}/ for dedicated tier", () => {
    expect(syncPrefixForTier("dedicated", { tenantId: "acme" })).toBe("tenant/acme/");
  });

  it("throws when dedicated tier lacks tenantId", () => {
    expect(() => syncPrefixForTier("dedicated")).toThrow(/tenantId/);
  });

  it("normalizes enterprise custom prefix with trailing slash", () => {
    expect(syncPrefixForTier("enterprise", { customPrefix: "teams/prod" })).toBe("teams/prod/");
    expect(syncPrefixForTier("enterprise", { customPrefix: "teams/prod/" })).toBe("teams/prod/");
  });

  it("throws when enterprise tier lacks syncPrefix", () => {
    expect(() => syncPrefixForTier("enterprise")).toThrow(/syncPrefix/);
  });
});

describe("ssmParameterPrefixForTenant", () => {
  it("sanitizes tenant id for SSM path", () => {
    expect(ssmParameterPrefixForTenant("Acme Corp!")).toBe("/clawql/tenants/Acme-Corp-/sync");
  });
});

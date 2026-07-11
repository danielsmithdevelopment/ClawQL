import type { ManagedTier } from "./types.js";

/** Team bucket prefix for managed tiers (no secrets). */
export function syncPrefixForTier(
  tier: ManagedTier,
  opts: { tenantId?: string; customPrefix?: string } = {}
): string {
  switch (tier) {
    case "shared":
      return "shared/";
    case "dedicated": {
      const id = opts.tenantId?.trim();
      if (!id) {
        throw new Error("dedicated tier requires tenantId");
      }
      return `tenant/${id}/`;
    }
    case "enterprise": {
      const prefix = opts.customPrefix?.trim();
      if (!prefix) {
        throw new Error("enterprise tier requires syncPrefix");
      }
      return prefix.endsWith("/") ? prefix : `${prefix}/`;
    }
  }
}

/** SSM path prefix for per-tenant sync credentials (AWS boot fetch). */
export function ssmParameterPrefixForTenant(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `/clawql/tenants/${safe}/sync`;
}

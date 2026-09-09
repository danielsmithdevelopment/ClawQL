/**
 * CPC helpers — org id slugs, owner tenant ids, plan → API key scopes.
 */

import type { ClawqlPlanId } from "../plans/tiers.js";
import { emailDomainOf } from "../credits/org.js";

/** Slugify a display name into a stable org id. */
export function slugifyOrgId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug;
}

/** Default owner member tenant: `orgId:email-local-slug`. */
export function ownerTenantIdForOrg(orgId: string, email: string): string {
  const local = email.trim().split("@")[0] ?? "owner";
  const localSlug =
    local
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "owner";
  return `${orgId.trim().toLowerCase()}:${localSlug}`;
}

/** Default API key scopes derived from plan tier. */
export function apiKeyScopesForPlan(planId: ClawqlPlanId): string[] {
  switch (planId) {
    case "free":
      return ["search", "memory"];
    case "pro":
      return ["execute", "search", "memory"];
    case "team":
    case "enterprise":
      return ["execute", "search", "memory", "audit"];
    default:
      return ["execute", "search", "memory"];
  }
}

/** Seed SSO domains from owner email when caller did not pass domains. */
export function defaultAllowedEmailDomains(
  ownerEmail: string,
  explicit?: readonly string[]
): string[] | undefined {
  if (explicit?.length) {
    return [...explicit];
  }
  const domain = emailDomainOf(ownerEmail);
  return domain ? [domain] : undefined;
}

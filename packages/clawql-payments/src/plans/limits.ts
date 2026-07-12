import type { Entitlements } from "./entitlements.js";
import type { MonthlyUsage } from "./usage.js";

export type LimitResource = "inference_calls" | "documents" | "memory_mb" | "seats";

export type LimitCheckResult =
  | { allowed: true; remaining: number | null }
  | { allowed: false; remaining: 0; reason: string };

export type LimitEnforcementInput = {
  entitlements: Entitlements;
  usage: MonthlyUsage;
  resource: LimitResource;
  requested?: number;
};

function limitForResource(
  entitlements: Entitlements,
  resource: LimitResource
): number {
  switch (resource) {
    case "inference_calls":
      return entitlements.inferenceCallsPerMonth;
    case "documents":
      return entitlements.documentsPerMonth;
    case "memory_mb":
      return entitlements.memoryMb;
    case "seats":
      return entitlements.seats;
  }
}

function usageForResource(usage: MonthlyUsage, resource: LimitResource): number {
  switch (resource) {
    case "inference_calls":
      return usage.inferenceCalls;
    case "documents":
      return usage.documents;
    case "memory_mb":
      return usage.memoryMbPeak;
    case "seats":
      return 0;
  }
}

export function checkEntitlementLimit(input: LimitEnforcementInput): LimitCheckResult {
  const limit = limitForResource(input.entitlements, input.resource);
  if (!Number.isFinite(limit)) {
    return { allowed: true, remaining: null };
  }

  const used = usageForResource(input.usage, input.resource);
  const requested = input.requested ?? 1;
  const remaining = Math.max(0, limit - used);

  if (used + requested > limit) {
    return {
      allowed: false,
      remaining: 0,
      reason: `${input.resource} limit reached (${used}/${limit} used this month)`,
    };
  }

  return { allowed: true, remaining: remaining - requested };
}

export function enforceEntitlementLimit(input: LimitEnforcementInput): void {
  const result = checkEntitlementLimit(input);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}

import type { ClawqlPlanDefinition, ClawqlPlanId } from "./tiers.js";
import { getPlanDefinition } from "./tiers.js";

export type EntitlementResource = "inference_calls" | "documents" | "memory_mb" | "seats" | "x402";

export type Entitlements = {
  planId: ClawqlPlanId;
  inferenceCallsPerMonth: number;
  documentsPerMonth: number;
  memoryMb: number;
  seats: number;
  x402Enabled: boolean;
  stripePriceId: string | null;
  /** Hosted MCP search/execute are never metered (GTM Phase 1). */
  mcpExecutionsUnlimited: true;
};

export function entitlementsFromPlan(planId: ClawqlPlanId): Entitlements {
  const plan = getPlanDefinition(planId);
  return {
    planId,
    inferenceCallsPerMonth: plan.inference_calls_per_month,
    documentsPerMonth: plan.documents_per_month,
    memoryMb: plan.memory_mb,
    seats: plan.seats,
    x402Enabled: plan.x402_enabled,
    stripePriceId: plan.stripe_price_id,
    mcpExecutionsUnlimited: true,
  };
}

export function planAllowsResource(
  plan: ClawqlPlanDefinition,
  resource: EntitlementResource
): boolean {
  switch (resource) {
    case "inference_calls":
      return plan.inference_calls_per_month > 0;
    case "documents":
      return plan.documents_per_month > 0;
    case "memory_mb":
      return plan.memory_mb > 0;
    case "seats":
      return plan.seats > 0;
    case "x402":
      return plan.x402_enabled;
    default:
      return false;
  }
}

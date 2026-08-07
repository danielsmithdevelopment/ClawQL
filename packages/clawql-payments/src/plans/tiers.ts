export type ClawqlPlanId = "free" | "pro" | "team" | "enterprise";

export type ClawqlPlanDefinition = {
  /**
   * Inference gateway calls (PorTAL / OpenAI-compatible). Separate from MCP
   * search/execute — hosted gateway tiers never meter MCP executions (GTM).
   */
  inference_calls_per_month: number;
  documents_per_month: number;
  memory_mb: number;
  seats: number;
  x402_enabled: boolean;
  stripe_price_id: string | null;
  /** Always true on hosted plans — Worker must not enforce an execution meter. */
  mcp_executions_unlimited: true;
};

export const CLAWQL_PLANS: Record<ClawqlPlanId, ClawqlPlanDefinition> = {
  free: {
    inference_calls_per_month: 100,
    documents_per_month: 10,
    memory_mb: 100,
    seats: 1,
    x402_enabled: false,
    stripe_price_id: null,
    mcp_executions_unlimited: true,
  },
  pro: {
    inference_calls_per_month: 10_000,
    documents_per_month: 500,
    memory_mb: 5_000,
    seats: 1,
    x402_enabled: true,
    stripe_price_id: process.env.STRIPE_PRO_PRICE_ID ?? null,
    mcp_executions_unlimited: true,
  },
  team: {
    inference_calls_per_month: 100_000,
    documents_per_month: 5_000,
    memory_mb: 50_000,
    seats: 20,
    x402_enabled: true,
    stripe_price_id: process.env.STRIPE_TEAM_PRICE_ID ?? null,
    mcp_executions_unlimited: true,
  },
  enterprise: {
    inference_calls_per_month: Infinity,
    documents_per_month: Infinity,
    memory_mb: Infinity,
    seats: Infinity,
    x402_enabled: true,
    stripe_price_id: null,
    mcp_executions_unlimited: true,
  },
} as const;

export function getPlanDefinition(planId: ClawqlPlanId): ClawqlPlanDefinition {
  return CLAWQL_PLANS[planId];
}

export function isClawqlPlanId(value: string): value is ClawqlPlanId {
  return value in CLAWQL_PLANS;
}

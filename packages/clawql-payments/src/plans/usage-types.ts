import type { ClawqlPlanId } from "./tiers.js";

export type UsageMetric = "inference_calls" | "documents" | "memory_mb";

export type MonthlyUsage = {
  month: string;
  tenantId: string;
  planId: ClawqlPlanId;
  inferenceCalls: number;
  documents: number;
  memoryMbPeak: number;
};

export type UsageStore = {
  readonly getUsage: (tenantId: string, month?: string) => Promise<MonthlyUsage>;
  readonly increment: (
    tenantId: string,
    metric: UsageMetric,
    amount?: number,
    planId?: ClawqlPlanId
  ) => Promise<MonthlyUsage>;
};

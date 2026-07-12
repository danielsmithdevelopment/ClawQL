import type { InferenceUsage } from "../gateway.js";

/** Rough USD estimate for budget enforcement (no provider-specific pricing yet). */
export function estimateCostUsd(usage: InferenceUsage | undefined): number {
  if (!usage) return 0;
  const input = usage.inputTokens * 0.000_001;
  const output = usage.outputTokens * 0.000_003;
  return input + output;
}

export function isBudgetExceeded(spentUsd: number, budgetUsd: number | undefined): boolean {
  if (budgetUsd === undefined || budgetUsd <= 0) return false;
  return spentUsd >= budgetUsd;
}

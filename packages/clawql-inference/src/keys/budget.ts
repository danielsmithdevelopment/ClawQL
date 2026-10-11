import { Effect } from "effect";
import type { InferenceUsage } from "../gateway.js";
import {
  DEFAULT_INPUT_USD_PER_TOKEN,
  DEFAULT_OUTPUT_USD_PER_TOKEN,
  estimateCostUsdEffect,
} from "./pricing.js";

export { DEFAULT_INPUT_USD_PER_TOKEN, DEFAULT_OUTPUT_USD_PER_TOKEN };

/**
 * Host-boundary façade for VK spend recording.
 * Prefer {@link estimateCostUsdEffect} / {@link TokenPricingService} in Effect code.
 */
export function estimateCostUsd(
  usage: InferenceUsage | undefined,
  modelOrProviderKey?: string
): number {
  return Effect.runSync(estimateCostUsdEffect(usage, modelOrProviderKey));
}

export function isBudgetExceeded(spentUsd: number, budgetUsd: number | undefined): boolean {
  if (budgetUsd === undefined || budgetUsd <= 0) return false;
  return spentUsd >= budgetUsd;
}

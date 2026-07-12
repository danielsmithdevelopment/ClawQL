import type { ModelTier } from "./types.js";

/** Ordered PAL ladder — one-notch escalation only. */
export const PAL_TIER_ORDER: readonly ModelTier[] = ["frugal", "standard", "frontier"] as const;

export function nextPalTier(current: ModelTier): ModelTier | null {
  const idx = PAL_TIER_ORDER.indexOf(current);
  if (idx < 0 || idx >= PAL_TIER_ORDER.length - 1) return null;
  return PAL_TIER_ORDER[idx + 1]!;
}

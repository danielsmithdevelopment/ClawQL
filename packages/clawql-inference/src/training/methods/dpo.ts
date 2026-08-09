import type { DpoVariant } from "../types.js";

export const methodId = "dpo" as const;

export function describeDpoMethod(variant: DpoVariant = "standard"): string {
  switch (variant) {
    case "ipo":
      return "IPO — conservative preference optimization for small pair sets (<500).";
    case "kto":
      return "KTO — unpaired good/bad labels from per-trace scores.";
    case "orpo":
      return "ORPO — combined SFT + preference in one pass.";
    default:
      return "DPO — train on (prompt, chosen, rejected) without a reward model.";
  }
}

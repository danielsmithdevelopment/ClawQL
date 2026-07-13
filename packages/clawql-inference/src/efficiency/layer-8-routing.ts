import type { ModelEscalationDecision } from "../routing/types.js";
import type { TokenEfficiencyConfig } from "./config.js";

const AUTO_MODEL_ALIASES = new Set([
  "auto",
  "clawql/auto",
  "clawql-auto",
  "clawql/frugal",
  "clawql/standard",
  "clawql/frontier",
]);

export function isAutoRouteModel(model?: string): boolean {
  if (!model) return false;
  return AUTO_MODEL_ALIASES.has(model.trim().toLowerCase());
}

export function resolveAutoRouteTier(model: string): "frugal" | "standard" | "frontier" | undefined {
  const normalized = model.trim().toLowerCase();
  if (normalized === "clawql/standard") return "standard";
  if (normalized === "clawql/frontier") return "frontier";
  if (normalized === "clawql/frugal") return "frugal";
  return undefined;
}

/** Layer 8 — pick tier model for HTTP auto-route aliases. */
export function resolveHttpRoutingDecision(input: {
  model?: string;
  config: TokenEfficiencyConfig;
  seedId?: string;
  isDecomposedChild?: boolean;
}): ModelEscalationDecision | undefined {
  if (!input.model) return undefined;
  if (!input.config.httpAutoRoute && !input.config.escalation.enabled) return undefined;
  if (!isAutoRouteModel(input.model)) return undefined;

  const pinnedTier = resolveAutoRouteTier(input.model);
  if (pinnedTier) {
    return {
      tier: pinnedTier,
      modelId: input.config.escalation.tierMap[pinnedTier],
      retryAttempt: 0,
    };
  }

  return {
    tier: "frugal",
    modelId: input.config.escalation.tierMap.frugal,
    retryAttempt: 0,
  };
}

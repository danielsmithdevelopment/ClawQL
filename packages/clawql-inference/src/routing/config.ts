import type { ModelTierMap } from "./types.js";
import { TierEscalationRouter } from "./tier-escalation-router.js";
import type { AdaptiveRouter } from "./types.js";

export interface ModelEscalationConfig {
  /** When false and no model pin, model escalation is disabled. */
  enabled: boolean;
  tierMap: ModelTierMap;
  /** Bypass tier ladder and pin a single model id. */
  modelPin?: string;
}

const DEFAULT_TIER_MAP: ModelTierMap = {
  frugal: "ollama/phi4",
  standard: "groq/llama-3.3-70b",
  frontier: "anthropic/claude-sonnet-4",
};

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readTierMap(env: NodeJS.ProcessEnv): ModelTierMap {
  return {
    frugal: env.CLAWQL_INFERENCE_MODEL_FRUGAL?.trim() || DEFAULT_TIER_MAP.frugal,
    standard: env.CLAWQL_INFERENCE_MODEL_STANDARD?.trim() || DEFAULT_TIER_MAP.standard,
    frontier: env.CLAWQL_INFERENCE_MODEL_FRONTIER?.trim() || DEFAULT_TIER_MAP.frontier,
  };
}

/**
 * Load model escalation config from environment (off by default).
 *
 * Kill switches:
 * - `CLAWQL_INFERENCE_ROUTING_ENABLED=0` (or unset) disables escalation
 * - `CLAWQL_INFERENCE_MODEL_PIN=<modelId>` pins a model (implies escalation on)
 */
export function loadModelEscalationConfig(
  env: NodeJS.ProcessEnv = process.env
): ModelEscalationConfig {
  const modelPin = env.CLAWQL_INFERENCE_MODEL_PIN?.trim() || undefined;
  const enabled = parseTruthy(env.CLAWQL_INFERENCE_ROUTING_ENABLED) || modelPin !== undefined;

  return {
    enabled,
    tierMap: readTierMap(env),
    modelPin,
  };
}

/** Create a tier escalation router when model escalation is enabled or a model pin is set. */
export function createModelEscalationRouter(
  config: ModelEscalationConfig
): AdaptiveRouter | undefined {
  if (!config.enabled && !config.modelPin) return undefined;
  return new TierEscalationRouter(config);
}

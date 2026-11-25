import { Effect } from "effect";
import type { ModelTierMap } from "./types.js";
import { TierEscalationRouter } from "./tier-escalation-router.js";
import type { AdaptiveRouter } from "./types.js";
import { loadTierMapOverridesEffect, mergeTierMap } from "../finetune/tier-registry.js";
import {
  assertInferenceModelAllowed,
  filterLocalOnlyModelIds,
  inferenceLocalOnlyEnabled,
} from "../policy/local-only.js";

export interface ModelEscalationConfig {
  /** When false and no model pin, model escalation is disabled. */
  enabled: boolean;
  tierMap: ModelTierMap;
  /** Bypass tier ladder and pin a single model id. */
  modelPin?: string;
}

const DEFAULT_TIER_MAP: ModelTierMap = {
  frugal: "ollama/phi4",
  // Audit 6.07: align with Groq API / catalog id.
  standard: "groq/llama-3.3-70b-versatile",
  frontier: "anthropic/claude-sonnet-4",
};

/** Local-only defaults when regulated / CLAWQL_INFERENCE_LOCAL_ONLY (audit 6.06). */
const LOCAL_ONLY_TIER_MAP: ModelTierMap = {
  frugal: "ollama/phi4",
  standard: "ollama/llama3.2",
  frontier: "ollama/llama3.2",
};

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readTierMap(env: NodeJS.ProcessEnv, overrides?: Partial<ModelTierMap>): ModelTierMap {
  const defaults = inferenceLocalOnlyEnabled(env) ? LOCAL_ONLY_TIER_MAP : DEFAULT_TIER_MAP;
  const base = {
    frugal: env.CLAWQL_INFERENCE_MODEL_FRUGAL?.trim() || defaults.frugal,
    standard: env.CLAWQL_INFERENCE_MODEL_STANDARD?.trim() || defaults.standard,
    frontier: env.CLAWQL_INFERENCE_MODEL_FRONTIER?.trim() || defaults.frontier,
  };
  const merged = overrides ? mergeTierMap(base, overrides) : base;
  if (!inferenceLocalOnlyEnabled(env)) return merged;
  // Drop cloud overrides that violate local-only; fall back to local defaults.
  const kept = filterLocalOnlyModelIds([merged.frugal, merged.standard, merged.frontier], env);
  return {
    frugal: kept.includes(merged.frugal) ? merged.frugal : LOCAL_ONLY_TIER_MAP.frugal,
    standard: kept.includes(merged.standard) ? merged.standard : LOCAL_ONLY_TIER_MAP.standard,
    frontier: kept.includes(merged.frontier) ? merged.frontier : LOCAL_ONLY_TIER_MAP.frontier,
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
  const rawPin = env.CLAWQL_INFERENCE_MODEL_PIN?.trim() || undefined;
  if (rawPin) {
    assertInferenceModelAllowed(rawPin, env);
  }
  const modelPin = rawPin;
  const enabled = parseTruthy(env.CLAWQL_INFERENCE_ROUTING_ENABLED) || modelPin !== undefined;

  return {
    enabled,
    tierMap: readTierMap(env),
    modelPin,
  };
}

/** Effect-primary variant that merges tier-map.json overrides from $CLAWQL_HOME/Inference. */
export function loadModelEscalationConfigEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ModelEscalationConfig, Error> {
  return Effect.gen(function* () {
    const overrides = yield* loadTierMapOverridesEffect(env);
    const rawPin = env.CLAWQL_INFERENCE_MODEL_PIN?.trim() || undefined;
    if (rawPin) {
      yield* Effect.try({
        try: () => assertInferenceModelAllowed(rawPin, env),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });
    }
    const modelPin = rawPin;
    const enabled = parseTruthy(env.CLAWQL_INFERENCE_ROUTING_ENABLED) || modelPin !== undefined;
    return {
      enabled,
      tierMap: readTierMap(env, overrides),
      modelPin,
    };
  });
}

/** Promise façade. */
export async function loadModelEscalationConfigAsync(
  env: NodeJS.ProcessEnv = process.env
): Promise<ModelEscalationConfig> {
  return Effect.runPromise(loadModelEscalationConfigEffect(env));
}

/** Create a tier escalation router when model escalation is enabled or a model pin is set. */
export function createModelEscalationRouter(
  config: ModelEscalationConfig
): AdaptiveRouter | undefined {
  if (!config.enabled && !config.modelPin) return undefined;
  return new TierEscalationRouter(config);
}

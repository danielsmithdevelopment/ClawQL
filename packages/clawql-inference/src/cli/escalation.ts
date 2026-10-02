import { loadModelEscalationConfigAsync } from "../routing/config.js";
import { registerModelToTier } from "../finetune/tier-registry.js";
import type { ModelTier } from "../routing/types.js";
import { Effect } from "effect";

export type InferenceEscalationShowOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceEscalationShowImpl(
  options: InferenceEscalationShowOptions = {}
): Promise<number>  {
  const config = await loadModelEscalationConfigAsync(options.env);
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return 0;
  }
  console.log(`enabled: ${config.enabled}`);
  if (config.modelPin) console.log(`model_pin: ${config.modelPin}`);
  console.log("tier_map:");
  for (const [tier, modelId] of Object.entries(config.tierMap)) {
    console.log(`  ${tier.padEnd(10)} ${modelId}`);
  }
  return 0;
}

export function runInferenceEscalationShowEffect(
  options: InferenceEscalationShowOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceEscalationShowImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceEscalationShowEffect} for Effect callers. */
export async function runInferenceEscalationShow(
  options: InferenceEscalationShowOptions = {}
): Promise<number>  {
  return Effect.runPromise(runInferenceEscalationShowEffect(options));
}

export type InferenceEscalationSetTierOptions = {
  tier?: ModelTier;
  model?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceEscalationSetTierImpl(
  options: InferenceEscalationSetTierOptions
): Promise<number>  {
  if (!options.tier || !options.model?.trim()) {
    console.error(
      "Usage: clawql inference escalation set-tier --tier frugal|standard|frontier --model <provider/model>"
    );
    return 1;
  }
  const { path, tierMap } = await registerModelToTier(
    options.tier,
    options.model.trim(),
    options.env
  );
  if (options.json) {
    console.log(JSON.stringify({ path, tierMap }, null, 2));
  } else {
    console.log(`Set ${options.tier} → ${options.model.trim()} (saved to ${path})`);
  }
  return 0;
}

export function runInferenceEscalationSetTierEffect(
  options: InferenceEscalationSetTierOptions
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceEscalationSetTierImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceEscalationSetTierEffect} for Effect callers. */
export async function runInferenceEscalationSetTier(
  options: InferenceEscalationSetTierOptions
): Promise<number>  {
  return Effect.runPromise(runInferenceEscalationSetTierEffect(options));
}

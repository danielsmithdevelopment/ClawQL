import { loadModelEscalationConfigAsync } from "../routing/config.js";
import { registerModelToTier } from "../finetune/tier-registry.js";
import type { ModelTier } from "../routing/types.js";

export type InferenceEscalationShowOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceEscalationShow(
  options: InferenceEscalationShowOptions = {}
): Promise<number> {
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

export type InferenceEscalationSetTierOptions = {
  tier?: ModelTier;
  model?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceEscalationSetTier(
  options: InferenceEscalationSetTierOptions
): Promise<number> {
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

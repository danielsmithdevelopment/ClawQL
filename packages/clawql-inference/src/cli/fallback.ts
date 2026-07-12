import { loadFallbackConfig, resolveFallbackChainsPath } from "../fallback/config.js";

export type InferenceFallbackShowOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceFallbackShow(
  options: InferenceFallbackShowOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = loadFallbackConfig(env);
  const payload = {
    ...config,
    chainsPath: resolveFallbackChainsPath(env),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(`fallback_enabled: ${config.enabled}`);
  console.log(`chains_file: ${payload.chainsPath}`);
  if (Object.keys(config.chains.byTier).length) {
    console.log("by_tier:");
    for (const [tier, chain] of Object.entries(config.chains.byTier)) {
      console.log(`  ${tier}: ${chain?.join(" → ")}`);
    }
  }
  if (Object.keys(config.chains.byModel).length) {
    console.log("by_model:");
    for (const [model, chain] of Object.entries(config.chains.byModel)) {
      console.log(`  ${model}: ${chain.join(" → ")}`);
    }
  }
  if (!Object.keys(config.chains.byTier).length && !Object.keys(config.chains.byModel).length) {
    console.log("No fallback chains configured.");
  }
  return 0;
}

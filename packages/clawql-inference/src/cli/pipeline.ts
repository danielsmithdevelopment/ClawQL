import { buildPipelineConfig, loadPipelineConfig, savePipelineConfig } from "../pipeline/config.js";
import { runPipelineOnce } from "../pipeline/run.js";
import type { InferencePipelineConfig } from "../pipeline/types.js";
import type { EvaluatorVerdict } from "../store/types.js";
import type { ExportFormat } from "../export/types.js";
import type { FinetuneProvider } from "../finetune/types.js";
import type { ModelTier } from "../routing/types.js";

export type InferencePipelineCliOptions = {
  schedule?: string;
  minSamples?: number;
  verdict?: EvaluatorVerdict;
  targetTier?: ModelTier;
  baseModel?: string;
  provider?: FinetuneProvider;
  format?: ExportFormat;
  evaluateBeforePromote?: boolean;
  outputDir?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runInferencePipelineEnable(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  const config = buildPipelineConfig({
    enabled: true,
    schedule: options.schedule,
    minSamples: options.minSamples,
    verdict: options.verdict,
    targetTier: options.targetTier,
    baseModel: options.baseModel,
    provider: options.provider,
    format: options.format,
    evaluateBeforePromote: options.evaluateBeforePromote,
    outputDir: options.outputDir,
  });
  const path = await savePipelineConfig(config, options.env);
  if (options.json) {
    console.log(JSON.stringify({ path, config }, null, 2));
  } else {
    console.log(`Pipeline enabled (config: ${path}, schedule: ${config.schedule})`);
  }
  return 0;
}

export async function runInferencePipelineStatus(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  const config = await loadPipelineConfig(options.env);
  if (!config) {
    console.log("Pipeline is not configured.");
    return 0;
  }
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(`enabled: ${config.enabled}`);
    console.log(`schedule: ${config.schedule}`);
    console.log(`min_samples: ${config.minSamples}`);
    console.log(`verdict: ${config.verdict}`);
    console.log(`target_tier: ${config.targetTier}`);
    console.log(`base_model: ${config.baseModel}`);
    console.log(`provider: ${config.provider}`);
    console.log(`updated_at: ${config.updatedAt}`);
  }
  return 0;
}

export async function runInferencePipelineDisable(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  const existing = await loadPipelineConfig(options.env);
  const config: InferencePipelineConfig = buildPipelineConfig({
    ...(existing ?? {}),
    enabled: false,
  });
  const path = await savePipelineConfig(config, options.env);
  if (options.json) {
    console.log(JSON.stringify({ path, config }, null, 2));
  } else {
    console.log(`Pipeline disabled (config: ${path})`);
  }
  return 0;
}

export async function runInferencePipelineRun(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  const config = await loadPipelineConfig(options.env);
  if (!config?.enabled) {
    console.error("Pipeline is not enabled. Run: clawql inference pipeline enable ...");
    return 1;
  }
  try {
    const result = await runPipelineOnce(config, options.env);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (!result.exported) {
      console.log(
        `Pipeline skipped: ${result.skippedReason ?? "unknown"} (${result.sampleCount} samples)`
      );
      return 0;
    }
    console.log(
      `Pipeline exported ${result.sampleCount} samples → ${result.outputPath}${
        result.finetuneJobId ? ` (finetune job: ${result.finetuneJobId})` : ""
      }`
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

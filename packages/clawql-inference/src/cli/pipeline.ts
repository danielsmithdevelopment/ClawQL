import { buildPipelineConfig, loadPipelineConfig, savePipelineConfig } from "../pipeline/config.js";
import { runPipelineOnce } from "../pipeline/run.js";
import { startPipelineWorker } from "../pipeline/worker.js";
import type { InferencePipelineConfig } from "../pipeline/types.js";
import type { EvaluatorVerdict } from "../store/types.js";
import type { ExportFormat } from "../export/types.js";
import type { FinetuneProvider } from "../finetune/types.js";
import type { ModelTier } from "../routing/types.js";
import { Effect } from "effect";

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

async function runInferencePipelineEnableImpl(
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

export function runInferencePipelineEnableEffect(
  options: InferencePipelineCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePipelineEnableImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePipelineEnableEffect} for Effect callers. */
export async function runInferencePipelineEnable(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferencePipelineEnableEffect(options));
}

async function runInferencePipelineStatusImpl(
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
    if (config.lastRunAt) console.log(`last_run_at: ${config.lastRunAt}`);
    if (config.lastRunStatus) console.log(`last_run_status: ${config.lastRunStatus}`);
    if (config.lastRunDetail) console.log(`last_run_detail: ${config.lastRunDetail}`);
    console.log(`updated_at: ${config.updatedAt}`);
  }
  return 0;
}

export function runInferencePipelineStatusEffect(
  options: InferencePipelineCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePipelineStatusImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePipelineStatusEffect} for Effect callers. */
export async function runInferencePipelineStatus(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferencePipelineStatusEffect(options));
}

async function runInferencePipelineDisableImpl(
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

export function runInferencePipelineDisableEffect(
  options: InferencePipelineCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePipelineDisableImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePipelineDisableEffect} for Effect callers. */
export async function runInferencePipelineDisable(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferencePipelineDisableEffect(options));
}

async function runInferencePipelineRunImpl(
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

export function runInferencePipelineRunEffect(
  options: InferencePipelineCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePipelineRunImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePipelineRunEffect} for Effect callers. */
export async function runInferencePipelineRun(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferencePipelineRunEffect(options));
}

async function runInferencePipelineWorkerImpl(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  startPipelineWorker({ env });
  if (options.json) {
    console.log(JSON.stringify({ worker: "started" }, null, 2));
    return 0;
  }
  console.log("Pipeline worker started (cron evaluation loop). Press Ctrl+C to stop.");
  await new Promise<void>(() => {});
  return 0;
}

export function runInferencePipelineWorkerEffect(
  options: InferencePipelineCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferencePipelineWorkerImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferencePipelineWorkerEffect} for Effect callers. */
export async function runInferencePipelineWorker(
  options: InferencePipelineCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferencePipelineWorkerEffect(options));
}

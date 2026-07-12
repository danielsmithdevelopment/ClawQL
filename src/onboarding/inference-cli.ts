/**
 * `clawql inference` — thin wrapper over clawql-inference gateway MVP.
 */

import {
  runInferenceFallbackShow,
  runInferenceCacheStatus,
  runInferenceKeysCreate,
  runInferenceKeysList,
  runInferenceKeysRevoke,
  runInferenceComplete,
  runInferenceEscalationSetTier,
  runInferenceEscalationShow,
  runInferenceExportCli,
  runInferenceFinetune,
  runInferenceFinetuneRegister,
  runInferenceFinetuneStatus,
  runInferenceLogs,
  runInferencePipelineDisable,
  runInferencePipelineEnable,
  runInferencePipelineRun,
  runInferencePipelineWorker,
  runInferencePipelineStatus,
  runInferencePolicyShow,
  runInferenceServe,
  runInferenceSpend,
  runInferenceTrace,
  type ExportFormat,
  type FinetuneProvider,
} from "clawql-inference";
import type { ModelTier } from "clawql-inference";

export type InferenceCliOptions = {
  port?: number;
  host?: string;
  model?: string;
  provider?: string;
  message?: string;
  correlationId?: string;
  since?: string;
  limit?: number;
  groupBy?: "model" | "provider" | "tier" | "team";
  json?: boolean;
  output?: string;
  format?: ExportFormat;
  verdict?: "passed" | "failed" | "none";
  minScore?: number;
  dateFrom?: string;
  dateTo?: string;
  maxLatencyMs?: number;
  minTokenEfficiency?: number;
  excludeCacheHits?: boolean;
  noPiiScrub?: boolean;
  writeManifest?: boolean;
  dataset?: string;
  manifest?: string;
  baseModel?: string;
  finetuneProvider?: FinetuneProvider;
  registerAs?: string;
  jobId?: string;
  tier?: ModelTier;
  alias?: string;
  schedule?: string;
  minSamples?: number;
  targetTier?: ModelTier;
  evaluateBeforePromote?: boolean;
  outputDir?: string;
  team?: string;
  budgetUsd?: number;
  rateLimit?: string;
  keyId?: string;
};

export async function runInferenceServeCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceServe({ port: opts.port, host: opts.host });
}

export async function runInferenceCompleteCmd(opts: InferenceCliOptions): Promise<number> {
  if (!opts.model?.trim()) {
    console.error("Usage: clawql inference complete --model <provider/model> --message <text>");
    return 1;
  }
  if (!opts.message?.trim()) {
    console.error("Usage: clawql inference complete --model <provider/model> --message <text>");
    return 1;
  }
  try {
    return await runInferenceComplete({
      model: opts.model,
      message: opts.message,
      correlationId: opts.correlationId,
      json: opts.json,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function runInferenceLogsCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceLogs({
    model: opts.model,
    provider: opts.provider,
    since: opts.since,
    limit: opts.limit,
    json: opts.json,
  });
}

export async function runInferenceTraceCmd(opts: InferenceCliOptions): Promise<number> {
  if (!opts.correlationId?.trim()) {
    console.error("Usage: clawql inference trace --correlation-id <id>");
    return 1;
  }
  return runInferenceTrace({
    correlationId: opts.correlationId,
    json: opts.json,
  });
}

export async function runInferenceSpendCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceSpend({
    groupBy: opts.groupBy,
    since: opts.since,
    json: opts.json,
  });
}

export async function runInferenceExportCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceExportCli({
    output: opts.output,
    format: opts.format,
    model: opts.model,
    provider: opts.provider,
    tier: opts.tier,
    verdict: opts.verdict,
    minScore: opts.minScore,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    maxLatencyMs: opts.maxLatencyMs,
    minTokenEfficiency: opts.minTokenEfficiency,
    excludeCacheHits: opts.excludeCacheHits,
    noPiiScrub: opts.noPiiScrub,
    writeManifest: opts.writeManifest,
  });
}

export async function runInferenceFinetuneCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceFinetune({
    dataset: opts.dataset,
    manifest: opts.manifest,
    baseModel: opts.baseModel,
    provider: opts.finetuneProvider,
    registerAs: opts.registerAs,
    json: opts.json,
  });
}

export async function runInferenceFinetuneStatusCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceFinetuneStatus({
    jobId: opts.jobId,
    provider: opts.finetuneProvider,
    json: opts.json,
  });
}

export async function runInferenceFinetuneRegisterCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceFinetuneRegister({
    jobId: opts.jobId,
    tier: opts.tier,
    alias: opts.alias,
    provider: opts.finetuneProvider,
    json: opts.json,
  });
}

export async function runInferenceEscalationShowCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceEscalationShow({ json: opts.json });
}

export async function runInferenceEscalationSetTierCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceEscalationSetTier({
    tier: opts.tier,
    model: opts.model,
    json: opts.json,
  });
}

export async function runInferencePipelineEnableCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePipelineEnable({
    schedule: opts.schedule,
    minSamples: opts.minSamples,
    verdict: opts.verdict,
    targetTier: opts.targetTier,
    baseModel: opts.baseModel,
    provider: opts.finetuneProvider,
    format: opts.format,
    evaluateBeforePromote: opts.evaluateBeforePromote,
    outputDir: opts.outputDir,
    json: opts.json,
  });
}

export async function runInferencePipelineStatusCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePipelineStatus({ json: opts.json });
}

export async function runInferencePipelineDisableCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePipelineDisable({ json: opts.json });
}

export async function runInferencePipelineRunCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePipelineRun({ json: opts.json });
}

export async function runInferenceCacheStatusCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceCacheStatus({ json: opts.json });
}

export async function runInferenceFallbackShowCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceFallbackShow({ json: opts.json });
}

export async function runInferenceKeysCreateCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceKeysCreate({
    team: opts.team,
    budgetUsd: opts.budgetUsd,
    rateLimit: opts.rateLimit,
    json: opts.json,
  });
}

export async function runInferenceKeysListCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceKeysList({ json: opts.json });
}

export async function runInferenceKeysRevokeCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferenceKeysRevoke({ id: opts.keyId, json: opts.json });
}

export async function runInferencePolicyShowCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePolicyShow({ json: opts.json });
}

export async function runInferencePipelineWorkerCmd(opts: InferenceCliOptions): Promise<number> {
  return runInferencePipelineWorker({ json: opts.json });
}

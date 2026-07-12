/**
 * `clawql inference` — thin wrapper over clawql-inference gateway MVP.
 */

import {
  runInferenceComplete,
  runInferenceExportCli,
  runInferenceFinetune,
  runInferenceFinetuneRegister,
  runInferenceFinetuneStatus,
  runInferenceLogs,
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
  groupBy?: "model" | "provider" | "tier";
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

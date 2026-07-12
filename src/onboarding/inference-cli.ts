/**
 * `clawql inference` — thin wrapper over clawql-inference gateway MVP.
 */

import {
  runInferenceComplete,
  runInferenceLogs,
  runInferenceServe,
  runInferenceSpend,
  runInferenceTrace,
} from "clawql-inference";

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

/**
 * `clawql inference` — thin wrapper over clawql-inference gateway MVP.
 */

import { runInferenceComplete, runInferenceServe } from "clawql-inference";

export type InferenceCliOptions = {
  port?: number;
  host?: string;
  model?: string;
  message?: string;
  correlationId?: string;
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

import { loadPipelineConfig, savePipelineConfig } from "./config.js";
import { cronMatchesUtc, toMinuteKey } from "./cron.js";
import { runPipelineOnce } from "./run.js";
import type { InferencePipelineConfig } from "./types.js";

let workerTimer: ReturnType<typeof setInterval> | null = null;
const minuteRunCache = new Set<string>();

export type PipelineWorkerOptions = {
  env?: NodeJS.ProcessEnv;
  pollMs?: number;
};

async function pipelineWorkerTick(env: NodeJS.ProcessEnv): Promise<void> {
  const config = await loadPipelineConfig(env);
  if (!config?.enabled) return;

  const now = new Date();
  if (!cronMatchesUtc(config.schedule, now)) return;

  const minuteKey = toMinuteKey(now);
  if (config.lastRunAt) {
    const last = new Date(config.lastRunAt);
    if (!Number.isNaN(last.getTime()) && toMinuteKey(last) === minuteKey) return;
  }
  if (minuteRunCache.has(`${config.updatedAt}:${minuteKey}`)) return;
  minuteRunCache.add(`${config.updatedAt}:${minuteKey}`);

  try {
    const result = await runPipelineOnce(config, env);
    const updated: InferencePipelineConfig = {
      ...config,
      lastRunAt: now.toISOString(),
      lastRunStatus: result.exported ? "ok" : "skipped",
      lastRunDetail: result.skippedReason ?? `exported ${result.sampleCount} samples`,
      updatedAt: new Date().toISOString(),
    };
    await savePipelineConfig(updated, env);
  } catch (error) {
    const updated: InferencePipelineConfig = {
      ...config,
      lastRunAt: now.toISOString(),
      lastRunStatus: "error",
      lastRunDetail: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    };
    await savePipelineConfig(updated, env);
  }
}

export function startPipelineWorker(options: PipelineWorkerOptions = {}): void {
  if (workerTimer) return;
  const env = options.env ?? process.env;
  const pollMs =
    options.pollMs ?? Number.parseInt(env.CLAWQL_INFERENCE_PIPELINE_POLL_MS?.trim() || "60000", 10);
  workerTimer = setInterval(() => {
    void pipelineWorkerTick(env).catch(() => {});
  }, pollMs);
  void pipelineWorkerTick(env).catch(() => {});
}

export function stopPipelineWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  minuteRunCache.clear();
}

/** Test helper */
export async function runPipelineWorkerTickOnce(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await pipelineWorkerTick(env);
}

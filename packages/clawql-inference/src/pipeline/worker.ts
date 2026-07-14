import { Effect } from "effect";
import { buildPipelineRunLockKey, tryAcquirePipelineAdvisoryLock } from "./advisory-lock.js";
import { loadPipelineConfig, savePipelineConfig } from "./config.js";
import { cronMatchesUtc, toMinuteKey } from "./cron.js";
import { startPipelineWorkerFiberEffect } from "./pipeline-worker-effect.js";
import { runPipelineOnce } from "./run.js";
import type { InferencePipelineConfig } from "./types.js";

let pipelineWorkerStop: (() => void) | null = null;
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
  const dedupeKey = `${config.updatedAt}:${minuteKey}`;
  if (minuteRunCache.has(dedupeKey)) return;

  const lockKey = buildPipelineRunLockKey(config.schedule, minuteKey);
  const lock = await tryAcquirePipelineAdvisoryLock(lockKey, env);
  if (!lock.acquired) return;

  minuteRunCache.add(dedupeKey);

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
  } finally {
    await lock.release();
  }
}

/** Start Effect daemon fiber for inference pipeline cron ticks. */
export function startPipelineWorker(options: PipelineWorkerOptions = {}): void {
  if (pipelineWorkerStop) return;
  const env = options.env ?? process.env;
  const pollMs =
    options.pollMs ?? Number.parseInt(env.CLAWQL_INFERENCE_PIPELINE_POLL_MS?.trim() || "60000", 10);
  const handle = Effect.runSync(
    startPipelineWorkerFiberEffect(() => pipelineWorkerTick(env), pollMs)
  );
  pipelineWorkerStop = handle.stop;
}

export function stopPipelineWorker(): void {
  if (pipelineWorkerStop) {
    pipelineWorkerStop();
    pipelineWorkerStop = null;
  }
  minuteRunCache.clear();
}

/** Test helper */
export async function runPipelineWorkerTickOnce(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await pipelineWorkerTick(env);
}

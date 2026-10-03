import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { createInferenceStore } from "../store/create.js";
import { filterRecordsForExport } from "../export/filter.js";
import { runInferenceExportEffect } from "../export/run-export.js";
import { submitFinetuneJobEffect } from "../finetune/jobs.js";
import { registerModelToTierEffect } from "../finetune/tier-registry.js";
import type { InferencePipelineConfig } from "./types.js";

export type PipelineRunResult = {
  sampleCount: number;
  exported: boolean;
  outputPath?: string;
  manifestPath?: string;
  finetuneJobId?: string;
  skippedReason?: string;
};

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function fromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({ try: tryFn, catch: asError });
}

export function runPipelineOnceEffect(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PipelineRunResult, Error> {
  return Effect.gen(function* () {
    const store = createInferenceStore({ env });
    if (!store) {
      return { sampleCount: 0, exported: false, skippedReason: "inference store disabled" };
    }

    const listed = yield* fromPromise(() => store.list({}));
    const records = filterRecordsForExport(listed, {
      verdict: config.verdict,
      tier: config.targetTier,
    });
    if (records.length < config.minSamples) {
      return {
        sampleCount: records.length,
        exported: false,
        skippedReason: `below min-samples (${records.length} < ${config.minSamples})`,
      };
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const outputDir = config.outputDir.startsWith("/")
      ? config.outputDir
      : join(env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql"), config.outputDir);
    yield* fromPromise(() => mkdir(outputDir, { recursive: true }).then(() => undefined));
    const outputPath = join(outputDir, `export-${stamp}.jsonl`);

    const exportResult = yield* runInferenceExportEffect({
      output: outputPath,
      format: config.format,
      verdict: config.verdict,
      tier: config.targetTier,
      env,
    });

    let finetuneJobId: string | undefined;
    if (!config.evaluateBeforePromote) {
      const job = yield* submitFinetuneJobEffect({
        datasetPath: exportResult.outputPath,
        manifestPath: exportResult.manifestPath,
        baseModel: config.baseModel,
        provider: config.provider,
        env,
      });
      finetuneJobId = job.id;
      if (job.fineTunedModel) {
        yield* registerModelToTierEffect(config.targetTier, job.fineTunedModel, env);
      }
    }

    return {
      sampleCount: records.length,
      exported: true,
      outputPath: exportResult.outputPath,
      manifestPath: exportResult.manifestPath,
      finetuneJobId,
    };
  });
}

/** Promise façade. */
export async function runPipelineOnce(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<PipelineRunResult> {
  return Effect.runPromise(runPipelineOnceEffect(config, env));
}

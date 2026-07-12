import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInferenceStore } from "../store/create.js";
import { filterRecordsForExport } from "../export/filter.js";
import { runInferenceExport } from "../export/run-export.js";
import { submitFinetuneJob } from "../finetune/jobs.js";
import { registerModelToTier } from "../finetune/tier-registry.js";
import type { InferencePipelineConfig } from "./types.js";

export type PipelineRunResult = {
  sampleCount: number;
  exported: boolean;
  outputPath?: string;
  manifestPath?: string;
  finetuneJobId?: string;
  skippedReason?: string;
};

export async function runPipelineOnce(
  config: InferencePipelineConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<PipelineRunResult> {
  const store = createInferenceStore({ env });
  if (!store) {
    return { sampleCount: 0, exported: false, skippedReason: "inference store disabled" };
  }

  const records = filterRecordsForExport(await store.list({}), {
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
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `export-${stamp}.jsonl`);

  const exportResult = await runInferenceExport({
    output: outputPath,
    format: config.format,
    verdict: config.verdict,
    tier: config.targetTier,
    env,
  });

  let finetuneJobId: string | undefined;
  if (!config.evaluateBeforePromote) {
    const job = await submitFinetuneJob({
      datasetPath: exportResult.outputPath,
      manifestPath: exportResult.manifestPath,
      baseModel: config.baseModel,
      provider: config.provider,
      env,
    });
    finetuneJobId = job.id;
    if (job.fineTunedModel) {
      await registerModelToTier(config.targetTier, job.fineTunedModel, env);
    }
  }

  return {
    sampleCount: records.length,
    exported: true,
    outputPath: exportResult.outputPath,
    manifestPath: exportResult.manifestPath,
    finetuneJobId,
  };
}

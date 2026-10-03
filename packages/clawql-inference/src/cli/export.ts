import { runInferenceExport } from "../export/run-export.js";
import type { ExportFormat } from "../export/types.js";
import type { EvaluatorVerdict } from "../store/types.js";
import { Effect } from "effect";

export type InferenceExportCliOptions = {
  output?: string;
  format?: ExportFormat;
  model?: string;
  provider?: string;
  tier?: string;
  verdict?: EvaluatorVerdict;
  minScore?: number;
  dateFrom?: string;
  dateTo?: string;
  maxLatencyMs?: number;
  minTokenEfficiency?: number;
  excludeCacheHits?: boolean;
  noPiiScrub?: boolean;
  writeManifest?: boolean;
  policyVersion?: string;
  okfVerified?: string;
  okfStatus?: string;
  vaultRef?: string;
  vaultPath?: string;
  baseModel?: string;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceExportCliImpl(options: InferenceExportCliOptions = {}): Promise<number> {
  try {
    const result = await runInferenceExport({
      output: options.output ?? "",
      format: options.format,
      model: options.model,
      provider: options.provider,
      tier: options.tier,
      verdict: options.verdict,
      minScore: options.minScore,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      maxLatencyMs: options.maxLatencyMs,
      minTokenEfficiency: options.minTokenEfficiency,
      excludeCacheHits: options.excludeCacheHits,
      noPiiScrub: options.noPiiScrub,
      writeManifest: options.writeManifest,
      policyVersion: options.policyVersion,
      okfVerified: options.okfVerified,
      okfStatus: options.okfStatus,
      vaultRef: options.vaultRef,
      vaultPath: options.vaultPath,
      baseModel: options.baseModel,
      env: options.env,
    });
    console.log(
      `Exported ${result.rowCount} samples to ${result.outputPath}${
        result.manifestPath ? ` (manifest: ${result.manifestPath})` : ""
      }`
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function runInferenceExportCliEffect(
  options: InferenceExportCliOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceExportCliImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceExportCliEffect} for Effect callers. */
export async function runInferenceExportCli(
  options: InferenceExportCliOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferenceExportCliEffect(options));
}

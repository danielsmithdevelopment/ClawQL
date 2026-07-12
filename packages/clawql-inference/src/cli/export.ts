import { runInferenceExport } from "../export/run-export.js";
import type { ExportFormat } from "../export/types.js";
import type { EvaluatorVerdict } from "../store/types.js";

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
  env?: NodeJS.ProcessEnv;
};

export async function runInferenceExportCli(
  options: InferenceExportCliOptions = {}
): Promise<number> {
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

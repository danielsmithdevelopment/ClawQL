import type { EvaluatorVerdict } from "../store/types.js";
import type { ExportFormat } from "../export/types.js";
import type { FinetuneProvider } from "../finetune/types.js";
import type { ModelTier } from "../routing/types.js";

export type InferencePipelineConfig = {
  enabled: boolean;
  schedule: string;
  minSamples: number;
  verdict: EvaluatorVerdict;
  targetTier: ModelTier;
  baseModel: string;
  provider: FinetuneProvider;
  format: ExportFormat;
  evaluateBeforePromote: boolean;
  outputDir: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: "ok" | "skipped" | "error";
  lastRunDetail?: string;
};

export const DEFAULT_PIPELINE_CONFIG: Omit<InferencePipelineConfig, "updatedAt"> = {
  enabled: false,
  schedule: "0 2 * * 0",
  minSamples: 500,
  verdict: "passed",
  targetTier: "frugal",
  baseModel: "gpt-4o-mini",
  provider: "openai",
  format: "openai-jsonl",
  evaluateBeforePromote: false,
  outputDir: "training-data",
};

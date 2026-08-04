import type { EvaluatorVerdict } from "../store/types.js";

/**
 * Dataset export formats.
 * `portal-bundle` is reserved for PorTAL task-latent + alignment artifacts
 * (see docs/inference/portal-flywheel.md) — not yet implemented in the writer.
 */
export type ExportFormat =
  | "openai-jsonl"
  | "anthropic-jsonl"
  | "raw-jsonl"
  | "sharegpt"
  | "portal-bundle";

export type ExportFilter = {
  modelId?: string;
  provider?: string;
  tier?: string;
  verdict?: EvaluatorVerdict;
  minScore?: number;
  dateFrom?: Date;
  dateTo?: Date;
  maxLatencyMs?: number;
  minTokenEfficiency?: number;
  excludeCacheHits?: boolean;
};

export type PiiScrubMode = "presidio" | "off";

export type ExportSampleLine = {
  line: string;
  sha256: string;
};

export type DatasetManifest = {
  version: 1;
  exportedAt: string;
  format: ExportFormat;
  outputPath: string;
  filters: ExportFilter;
  rowCount: number;
  byteSize: number;
  sampleHashes: string[];
  merkleRoot: string;
  policyVersion?: string;
  piiScrub: {
    enabled: boolean;
    provider: PiiScrubMode;
    presidioActive: boolean;
  };
};

export type RunExportResult = {
  rowCount: number;
  outputPath: string;
  manifestPath?: string;
  manifest?: DatasetManifest;
};

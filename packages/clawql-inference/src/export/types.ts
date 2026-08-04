import type { EvaluatorVerdict } from "../store/types.js";

/**
 * Dataset export formats.
 * `portal-bundle` writes a PorTAL adapter directory (task_latent + alignment + adapter_manifest.cqm).
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
  /** OKF v0.2 — only records whose vault note has verified.by matching this value (e.g. human). */
  okfVerified?: string;
  /** OKF v0.2 — only records whose vault note has this status (e.g. current). */
  okfStatus?: string;
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
  vaultRef?: string;
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

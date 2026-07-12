import type { EvaluatorVerdict } from "../store/types.js";

export type ExportFormat = "openai-jsonl" | "anthropic-jsonl" | "raw-jsonl" | "sharegpt";

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

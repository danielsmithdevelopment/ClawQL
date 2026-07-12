import { createHash } from "node:crypto";
import { buildMerkleSnapshot } from "clawql-core";
import type { DatasetManifest, ExportFilter, ExportFormat, ExportSampleLine, PiiScrubMode } from "./types.js";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function buildSampleLines(lines: string[]): ExportSampleLine[] {
  return lines.map((line) => ({ line, sha256: sha256Hex(line) }));
}

export function buildDatasetManifest(input: {
  format: ExportFormat;
  outputPath: string;
  filters: ExportFilter;
  samples: ExportSampleLine[];
  policyVersion?: string;
  piiScrub: PiiScrubMode;
  presidioActive: boolean;
}): DatasetManifest {
  const byteSize = input.samples.reduce((sum, s) => sum + Buffer.byteLength(s.line, "utf8") + 1, 0);
  const sampleHashes = input.samples.map((s) => s.sha256);
  const merkleRoot = buildMerkleSnapshot(
    sampleHashes.map((sha256, i) => ({
      path: `export/sample/${i}`,
      bodySha256Hex: sha256,
    }))
  ).rootHex;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    format: input.format,
    outputPath: input.outputPath,
    filters: input.filters,
    rowCount: input.samples.length,
    byteSize,
    sampleHashes,
    merkleRoot,
    policyVersion: input.policyVersion,
    piiScrub: {
      enabled: input.piiScrub !== "off",
      provider: input.piiScrub,
      presidioActive: input.presidioActive,
    },
  };
}

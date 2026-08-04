import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInferenceStore } from "../store/create.js";
import type { EvaluatorVerdict, InferenceRecord } from "../store/types.js";
import { filterRecordsForExport, type OkfTrustLookup } from "./filter.js";
import { formatExportLine } from "./format.js";
import { buildDatasetManifest, buildSampleLines } from "./manifest.js";
import { writePortalBundle } from "./portal-bundle.js";
import { presidioEnabled } from "clawql-api";
import { resolvePiiScrubMode, scrubExportLine } from "./pii.js";
import type { ExportFilter, ExportFormat, RunExportResult } from "./types.js";

export type RunInferenceExportOptions = {
  output: string;
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

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function loadOkfLookup(
  options: RunInferenceExportOptions
): Promise<OkfTrustLookup | undefined> {
  if (!options.okfVerified && !options.okfStatus) return undefined;
  const { loadOkfTrustByCorrelationIdFromVault, resolveVaultPathForExport } = await import(
    "./okf-vault-join.js"
  );
  const vault = resolveVaultPathForExport(options.vaultPath, options.env ?? process.env);
  if (!vault) {
    throw new Error(
      "OKF export filters require a vault: set CLAWQL_OBSIDIAN_VAULT_PATH or pass --vault"
    );
  }
  return loadOkfTrustByCorrelationIdFromVault(vault);
}

export async function runInferenceExport(
  options: RunInferenceExportOptions
): Promise<RunExportResult> {
  if (!options.output?.trim()) {
    throw new Error("Usage: clawql inference export --output <path>");
  }
  const store = createInferenceStore({ env: options.env });
  if (!store) {
    throw new Error("Inference store is disabled (CLAWQL_INFERENCE_STORE=off)");
  }

  const filter: ExportFilter = {
    modelId: options.model,
    provider: options.provider,
    tier: options.tier,
    verdict: options.verdict,
    minScore: options.minScore,
    dateFrom: parseDate(options.dateFrom),
    dateTo: parseDate(options.dateTo),
    maxLatencyMs: options.maxLatencyMs,
    minTokenEfficiency: options.minTokenEfficiency,
    excludeCacheHits: options.excludeCacheHits,
    okfVerified: options.okfVerified?.trim() || undefined,
    okfStatus: options.okfStatus?.trim() || undefined,
  };

  const okfLookup = await loadOkfLookup(options);
  const records = filterRecordsForExport(await store.list({ limit: undefined }), filter, okfLookup);
  const format = options.format ?? "openai-jsonl";
  const piiMode = resolvePiiScrubMode(options.noPiiScrub);

  // portal-bundle uses openai-jsonl lines internally for the training corpus
  const lineFormat: ExportFormat = format === "portal-bundle" ? "openai-jsonl" : format;
  const lines: string[] = [];
  for (const record of records) {
    const raw = formatExportLine(record, lineFormat);
    lines.push(await scrubExportLine(raw, piiMode));
  }

  const outputPath = options.output.trim();

  if (format === "portal-bundle") {
    return writePortalBundle({
      outputDir: outputPath,
      records,
      lines,
      filters: filter,
      piiScrub: piiMode,
      presidioActive: piiMode === "presidio" && presidioEnabled(),
      baseModel: options.baseModel,
      vaultRef: options.vaultRef,
    });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  await writeFile(outputPath, body, "utf8");

  const writeManifest = options.writeManifest !== false;
  let manifestPath: string | undefined;
  let manifest;
  if (writeManifest) {
    const samples = buildSampleLines(lines);
    manifest = buildDatasetManifest({
      format,
      outputPath,
      filters: filter,
      samples,
      policyVersion: options.policyVersion ?? records.find((r) => r.policyVersion)?.policyVersion,
      piiScrub: piiMode,
      presidioActive: piiMode === "presidio" && presidioEnabled(),
      vaultRef: options.vaultRef,
    });
    manifestPath = outputPath.replace(/\.jsonl$/i, ".manifest.json");
    if (manifestPath === outputPath) manifestPath = `${outputPath}.manifest.json`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  return { rowCount: lines.length, outputPath, manifestPath, manifest };
}

/** Test helper — export in-memory records without a store. */
export async function exportRecords(input: {
  records: InferenceRecord[];
  output: string;
  format?: ExportFormat;
  filter?: ExportFilter;
  okfByCorrelation?: OkfTrustLookup;
  noPiiScrub?: boolean;
  writeManifest?: boolean;
  baseModel?: string;
  vaultRef?: string;
}): Promise<RunExportResult> {
  const records = filterRecordsForExport(
    input.records,
    input.filter ?? {},
    input.okfByCorrelation
  );
  const format = input.format ?? "openai-jsonl";
  const piiMode = resolvePiiScrubMode(input.noPiiScrub);
  const lineFormat: ExportFormat = format === "portal-bundle" ? "openai-jsonl" : format;
  const lines: string[] = [];
  for (const record of records) {
    const raw = formatExportLine(record, lineFormat);
    lines.push(await scrubExportLine(raw, piiMode));
  }

  if (format === "portal-bundle") {
    return writePortalBundle({
      outputDir: input.output,
      records,
      lines,
      filters: input.filter ?? {},
      piiScrub: piiMode,
      presidioActive: false,
      baseModel: input.baseModel,
      vaultRef: input.vaultRef,
    });
  }

  const outputPath = input.output;
  await mkdir(dirname(outputPath), { recursive: true });
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  await writeFile(outputPath, body, "utf8");
  const samples = buildSampleLines(lines);
  const manifest = buildDatasetManifest({
    format,
    outputPath,
    filters: input.filter ?? {},
    samples,
    piiScrub: piiMode,
    presidioActive: false,
    vaultRef: input.vaultRef,
  });
  if (input.writeManifest !== false) {
    const manifestPath = `${outputPath}.manifest.json`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { rowCount: lines.length, outputPath, manifestPath, manifest };
  }
  return { rowCount: lines.length, outputPath, manifest };
}

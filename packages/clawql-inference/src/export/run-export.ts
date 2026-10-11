import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { createInferenceStore } from "../store/create.js";
import type { EvaluatorVerdict, InferenceRecord } from "../store/types.js";
import { filterRecordsForExport, type ExportFilterOptions, type OkfTrustLookup } from "./filter.js";
import { formatExportLine } from "./format.js";
import { buildDatasetManifest, buildSampleLines } from "./manifest.js";
import { writePortalBundle } from "./portal-bundle.js";
import { gatewayRedactionEnabled } from "clawql-api";
import { resolvePiiScrubMode, scrubExportLineEffect } from "./pii.js";
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
  /** Override erased content hashes (tests). When unset, loaded from vault deny-list. */
  erasedContentHashes?: ReadonlySet<string>;
};

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function fromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({ try: tryFn, catch: asError });
}

function loadOkfLookupEffect(
  options: RunInferenceExportOptions
): Effect.Effect<OkfTrustLookup | undefined, Error> {
  return Effect.gen(function* () {
    if (!options.okfVerified && !options.okfStatus) return undefined;
    const { loadOkfTrustByCorrelationIdFromVault, resolveVaultPathForExport } = yield* fromPromise(
      () => import("./okf-vault-join.js")
    );
    const vault = resolveVaultPathForExport(options.vaultPath, options.env ?? process.env);
    if (!vault) {
      return yield* Effect.fail(
        new Error(
          "OKF export filters require a vault: set CLAWQL_OBSIDIAN_VAULT_PATH or pass --vault"
        )
      );
    }
    return yield* fromPromise(() => loadOkfTrustByCorrelationIdFromVault(vault));
  });
}

function loadErasureDenyHashesForExportEffect(
  options: RunInferenceExportOptions
): Effect.Effect<ReadonlySet<string> | undefined> {
  return Effect.gen(function* () {
    if (options.erasedContentHashes) return options.erasedContentHashes;
    const { resolveVaultPathForExport } = yield* fromPromise(() => import("./okf-vault-join.js"));
    const vault = resolveVaultPathForExport(options.vaultPath, options.env ?? process.env);
    if (!vault) return undefined;
    return yield* fromPromise(async () => {
      const { loadErasureDenyHashes } = await import("clawql-memory/crypto/shred");
      return loadErasureDenyHashes(vault);
    }).pipe(Effect.orElseSucceed(() => undefined));
  }).pipe(Effect.orElseSucceed(() => undefined));
}

export function runInferenceExportEffect(
  options: RunInferenceExportOptions
): Effect.Effect<RunExportResult, Error> {
  return Effect.gen(function* () {
    if (!options.output?.trim()) {
      return yield* Effect.fail(new Error("Usage: clawql inference export --output <path>"));
    }
    const store = createInferenceStore({ env: options.env });
    if (!store) {
      return yield* Effect.fail(
        new Error("Inference store is disabled (CLAWQL_INFERENCE_STORE=off)")
      );
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

    const okfLookup = yield* loadOkfLookupEffect(options);
    const erasedContentHashes = yield* loadErasureDenyHashesForExportEffect(options);
    const filterOpts: ExportFilterOptions = {
      okfByCorrelation: okfLookup,
      erasedContentHashes,
    };
    const listed = yield* fromPromise(() => store.list({ limit: undefined }));
    const records = filterRecordsForExport(listed, filter, filterOpts);
    const format = options.format ?? "openai-jsonl";
    const piiMode = resolvePiiScrubMode(options.noPiiScrub);

    const lineFormat: ExportFormat = format === "portal-bundle" ? "openai-jsonl" : format;
    const lines: string[] = [];
    for (const record of records) {
      const raw = formatExportLine(record, lineFormat);
      lines.push(yield* scrubExportLineEffect(raw, piiMode));
    }

    const outputPath = options.output.trim();

    if (format === "portal-bundle") {
      return yield* fromPromise(() =>
        writePortalBundle({
          outputDir: outputPath,
          records,
          lines,
          filters: filter,
          piiScrub: piiMode,
          presidioActive: piiMode === "presidio" && gatewayRedactionEnabled(),
          baseModel: options.baseModel,
          vaultRef: options.vaultRef,
        })
      );
    }

    yield* fromPromise(() => mkdir(dirname(outputPath), { recursive: true }).then(() => undefined));
    const body = lines.length ? `${lines.join("\n")}\n` : "";
    yield* fromPromise(() => writeFile(outputPath, body, "utf8"));

    const writeManifest = options.writeManifest !== false;
    let manifestPath: string | undefined;
    let manifest: ReturnType<typeof buildDatasetManifest> | undefined;
    if (writeManifest) {
      const samples = buildSampleLines(lines);
      manifest = buildDatasetManifest({
        format,
        outputPath,
        filters: filter,
        samples,
        policyVersion: options.policyVersion ?? records.find((r) => r.policyVersion)?.policyVersion,
        piiScrub: piiMode,
        presidioActive: piiMode === "presidio" && gatewayRedactionEnabled(),
        vaultRef: options.vaultRef,
      });
      manifestPath = outputPath.replace(/\.jsonl$/i, ".manifest.json");
      if (manifestPath === outputPath) manifestPath = `${outputPath}.manifest.json`;
      yield* fromPromise(() =>
        writeFile(manifestPath!, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
      );
    }

    return { rowCount: lines.length, outputPath, manifestPath, manifest };
  });
}

/** Promise façade for CLI / pipeline. */
export async function runInferenceExport(
  options: RunInferenceExportOptions
): Promise<RunExportResult> {
  return Effect.runPromise(runInferenceExportEffect(options));
}

/** Test helper — export in-memory records without a store (Effect primary). */
export function exportRecordsEffect(input: {
  records: InferenceRecord[];
  output: string;
  format?: ExportFormat;
  filter?: ExportFilter;
  okfByCorrelation?: OkfTrustLookup;
  erasedContentHashes?: ReadonlySet<string>;
  noPiiScrub?: boolean;
  writeManifest?: boolean;
  baseModel?: string;
  vaultRef?: string;
}): Effect.Effect<RunExportResult, Error> {
  return Effect.gen(function* () {
    const records = filterRecordsForExport(input.records, input.filter ?? {}, {
      okfByCorrelation: input.okfByCorrelation,
      erasedContentHashes: input.erasedContentHashes,
    });
    const format = input.format ?? "openai-jsonl";
    const piiMode = resolvePiiScrubMode(input.noPiiScrub);
    const lineFormat: ExportFormat = format === "portal-bundle" ? "openai-jsonl" : format;
    const lines: string[] = [];
    for (const record of records) {
      const raw = formatExportLine(record, lineFormat);
      lines.push(yield* scrubExportLineEffect(raw, piiMode));
    }

    if (format === "portal-bundle") {
      return yield* fromPromise(() =>
        writePortalBundle({
          outputDir: input.output,
          records,
          lines,
          filters: input.filter ?? {},
          piiScrub: piiMode,
          presidioActive: false,
          baseModel: input.baseModel,
          vaultRef: input.vaultRef,
        })
      );
    }

    const outputPath = input.output;
    yield* fromPromise(() => mkdir(dirname(outputPath), { recursive: true }).then(() => undefined));
    const body = lines.length ? `${lines.join("\n")}\n` : "";
    yield* fromPromise(() => writeFile(outputPath, body, "utf8"));
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
      yield* fromPromise(() =>
        writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
      );
      return { rowCount: lines.length, outputPath, manifestPath, manifest };
    }
    return { rowCount: lines.length, outputPath, manifest };
  });
}

/** Promise façade. */
export async function exportRecords(input: {
  records: InferenceRecord[];
  output: string;
  format?: ExportFormat;
  filter?: ExportFilter;
  okfByCorrelation?: OkfTrustLookup;
  erasedContentHashes?: ReadonlySet<string>;
  noPiiScrub?: boolean;
  writeManifest?: boolean;
  baseModel?: string;
  vaultRef?: string;
}): Promise<RunExportResult> {
  return Effect.runPromise(exportRecordsEffect(input));
}

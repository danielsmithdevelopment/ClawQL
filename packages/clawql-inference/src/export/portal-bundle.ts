/**
 * PorTAL portal-bundle export — task-latent + alignment stubs with WORM provenance.
 * Full Python PorTAL training can replace placeholders via CLAWQL_PORTAL_TRAIN_CMD.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildMerkleSnapshot } from "clawql-core";
import type { InferenceRecord } from "../store/types.js";
import { formatExportLine } from "./format.js";
import { buildSampleLines, sha256Hex } from "./manifest.js";
import type { ExportFilter, PiiScrubMode, RunExportResult } from "./types.js";

export type PortalBundleManifest = {
  version: 1;
  kind: "portal-bundle";
  exportedAt: string;
  outputDir: string;
  filters: ExportFilter;
  rowCount: number;
  trainingJsonl: string;
  taskLatent: string;
  alignmentLora?: string;
  baseModel?: string;
  vaultRef?: string;
  merkleRoot: string;
  sampleHashes: string[];
  piiScrub: {
    enabled: boolean;
    provider: PiiScrubMode;
    presidioActive: boolean;
  };
  note: string;
};

function slugBaseModel(baseModel: string | undefined): string {
  const raw = (baseModel ?? "unspecified").trim() || "unspecified";
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
}

/** Write a PorTAL-shaped adapter directory (placeholders until Python train runs). */
export async function writePortalBundle(input: {
  outputDir: string;
  records: InferenceRecord[];
  lines: string[];
  filters: ExportFilter;
  piiScrub: PiiScrubMode;
  presidioActive: boolean;
  baseModel?: string;
  vaultRef?: string;
}): Promise<RunExportResult & { portalManifest?: PortalBundleManifest }> {
  const outputDir = input.outputDir.trim();
  await mkdir(outputDir, { recursive: true });

  const trainingPath = join(outputDir, "training.jsonl");
  const body = input.lines.length ? `${input.lines.join("\n")}\n` : "";
  await writeFile(trainingPath, body, "utf8");

  const samples = buildSampleLines(input.lines);
  const corpusDigest = sha256Hex(body);
  const taskLatentMeta = {
    format: "clawql-portal-task-latent-placeholder",
    version: 1,
    rowCount: input.lines.length,
    corpusSha256: corpusDigest,
    exportedAt: new Date().toISOString(),
    vaultRef: input.vaultRef,
    note: "Placeholder task-latent. Replace by running PorTAL train (CLAWQL_PORTAL_TRAIN_CMD) or supply a real .pt.",
  };
  const taskLatentPath = join(outputDir, "task_latent.pt");
  // Binary-ish placeholder: magic header + JSON metadata (PEFT loaders will reject — intentional until train).
  const taskLatentBytes = Buffer.concat([
    Buffer.from("CLAWQL_PORTAL_TASK_LATENT_V1\n", "utf8"),
    Buffer.from(JSON.stringify(taskLatentMeta, null, 2), "utf8"),
  ]);
  await writeFile(taskLatentPath, taskLatentBytes);

  const baseSlug = slugBaseModel(input.baseModel);
  const alignmentPath = join(outputDir, `alignment_${baseSlug}.lora`);
  const alignmentMeta = {
    format: "clawql-portal-alignment-placeholder",
    version: 1,
    baseModel: input.baseModel ?? "unspecified",
    taskLatent: "task_latent.pt",
    exportedAt: new Date().toISOString(),
  };
  await writeFile(
    alignmentPath,
    Buffer.concat([
      Buffer.from("CLAWQL_PORTAL_ALIGNMENT_V1\n", "utf8"),
      Buffer.from(JSON.stringify(alignmentMeta, null, 2), "utf8"),
    ])
  );

  const sampleHashes = samples.map((s) => s.sha256);
  const merkleRoot = buildMerkleSnapshot([
    { path: "training.jsonl", bodySha256Hex: corpusDigest },
    {
      path: "task_latent.pt",
      bodySha256Hex: createHash("sha256").update(taskLatentBytes).digest("hex"),
    },
    {
      path: basename(alignmentPath),
      bodySha256Hex: sha256Hex(JSON.stringify(alignmentMeta)),
    },
    ...sampleHashes.map((sha256, i) => ({
      path: `export/sample/${i}`,
      bodySha256Hex: sha256,
    })),
  ]).rootHex;

  const portalManifest: PortalBundleManifest = {
    version: 1,
    kind: "portal-bundle",
    exportedAt: new Date().toISOString(),
    outputDir,
    filters: input.filters,
    rowCount: input.lines.length,
    trainingJsonl: "training.jsonl",
    taskLatent: "task_latent.pt",
    alignmentLora: basename(alignmentPath),
    baseModel: input.baseModel,
    vaultRef: input.vaultRef,
    merkleRoot,
    sampleHashes,
    piiScrub: {
      enabled: input.piiScrub !== "off",
      provider: input.piiScrub,
      presidioActive: input.presidioActive,
    },
    note: "PorTAL bundle with placeholder task_latent/alignment — WORM-ready provenance. Run PorTAL train to replace placeholders.",
  };

  const manifestPath = join(outputDir, "adapter_manifest.cqm");
  await writeFile(manifestPath, `${JSON.stringify(portalManifest, null, 2)}\n`, "utf8");

  // Also keep a JSON twin for tooling that expects *.manifest.json
  await writeFile(
    join(outputDir, "adapter_manifest.manifest.json"),
    `${JSON.stringify(portalManifest, null, 2)}\n`,
    "utf8"
  );

  return {
    rowCount: input.lines.length,
    outputPath: outputDir,
    manifestPath,
    portalManifest,
  };
}

/** Alignment-only refit: copy task_latent, write new alignment stub + updated manifest. */
export async function writePortalRefit(input: {
  bundlePath: string;
  targetModel: string;
  outputDir: string;
}): Promise<{
  outputDir: string;
  alignmentLora: string;
  manifestPath: string;
}> {
  const bundlePath = input.bundlePath.trim();
  const outputDir = input.outputDir.trim();
  await mkdir(outputDir, { recursive: true });

  // Accept either task_latent.pt path or a bundle directory.
  let taskLatentSrc = bundlePath;
  let srcDir = bundlePath;
  if (bundlePath.endsWith(".pt")) {
    srcDir = join(bundlePath, "..");
  } else {
    taskLatentSrc = join(bundlePath, "task_latent.pt");
  }

  const taskLatentDest = join(outputDir, "task_latent.pt");
  await copyFile(taskLatentSrc, taskLatentDest);

  try {
    const trainingSrc = join(srcDir, "training.jsonl");
    await copyFile(trainingSrc, join(outputDir, "training.jsonl"));
  } catch {
    /* optional */
  }

  const baseSlug = slugBaseModel(input.targetModel);
  const alignmentName = `alignment_${baseSlug}.lora`;
  const alignmentPath = join(outputDir, alignmentName);
  const alignmentMeta = {
    format: "clawql-portal-alignment-placeholder",
    version: 1,
    baseModel: input.targetModel,
    taskLatent: "task_latent.pt",
    refitFrom: bundlePath,
    exportedAt: new Date().toISOString(),
    note: "Alignment-only refit stub. Replace with PorTAL alignment train output.",
  };
  await writeFile(
    alignmentPath,
    Buffer.concat([
      Buffer.from("CLAWQL_PORTAL_ALIGNMENT_V1\n", "utf8"),
      Buffer.from(JSON.stringify(alignmentMeta, null, 2), "utf8"),
    ])
  );

  let prev: Record<string, unknown> = {};
  try {
    const raw = await readFile(join(srcDir, "adapter_manifest.cqm"), "utf8");
    prev = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* fresh */
  }

  const taskBytes = await readFile(taskLatentDest);
  const merkleRoot = buildMerkleSnapshot([
    {
      path: "task_latent.pt",
      bodySha256Hex: createHash("sha256").update(taskBytes).digest("hex"),
    },
    {
      path: alignmentName,
      bodySha256Hex: sha256Hex(JSON.stringify(alignmentMeta)),
    },
  ]).rootHex;

  const manifest = {
    ...prev,
    version: 1,
    kind: "portal-bundle",
    exportedAt: new Date().toISOString(),
    outputDir,
    taskLatent: "task_latent.pt",
    alignmentLora: alignmentName,
    baseModel: input.targetModel,
    refitFrom: bundlePath,
    merkleRoot,
    note: "PorTAL alignment-only refit (placeholder until Python train).",
  };
  const manifestPath = join(outputDir, "adapter_manifest.cqm");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { outputDir, alignmentLora: alignmentName, manifestPath };
}

/** Format helper kept for type exhaustiveness when portal-bundle is used line-wise (should not). */
export function portalBundleLineNotSupported(): never {
  throw new Error("portal-bundle is a directory export — use writePortalBundle");
}

export function recordsToJsonlLines(records: InferenceRecord[]): string[] {
  return records.map((r) => formatExportLine(r, "openai-jsonl"));
}

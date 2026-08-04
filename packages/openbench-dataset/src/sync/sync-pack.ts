import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { S3CompatibleBackend, resolveR2ConfigFromEnv } from "../backends/s3.js";
import type { DatasetBackend } from "../backends/types.js";

export type SyncDatasetOptions = {
  datasetDir: string;
  runId: string;
  taskId: string;
  /** When true (default), missing R2 config fails. Set false for local dry-runs. */
  requireDurable?: boolean;
  backend?: DatasetBackend;
  dayPrefix?: string;
};

/**
 * Upload a local `dataset/` pack to R2 (or injected backend) using the corpus layout.
 */
export async function syncDatasetPack(opts: SyncDatasetOptions): Promise<{
  rawPrefix: string;
  manifestKey: string;
  traceFiles: number;
}> {
  const requireDurable = opts.requireDurable !== false;
  let backend = opts.backend;
  let bucketLabel = "local";

  if (!backend) {
    const resolved = resolveR2ConfigFromEnv();
    if (!resolved.ok) {
      const msg = `Durable R2 sink required but missing: ${resolved.missing.join(", ")}`;
      if (requireDurable) throw new Error(msg);
      console.warn(msg);
      return { rawPrefix: "", manifestKey: "", traceFiles: 0 };
    }
    backend = new S3CompatibleBackend(resolved.config);
    bucketLabel = resolved.bucket;
  }

  const day =
    opts.dayPrefix || new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const rawPrefix = `raw/${day}/run-${opts.runId}/${opts.taskId}`;
  const manifestKey = `manifests/${day}/run-${opts.runId}-${opts.taskId}.json`;

  const tracesDir = join(opts.datasetDir, "traces");
  const files = await readdir(tracesDir).catch(() => []);
  const jsonl = files.filter((f) => f.endsWith(".jsonl"));
  if (!jsonl.length) {
    throw new Error(`No traces under ${tracesDir}`);
  }

  for (const f of jsonl) {
    const body = await readFile(join(tracesDir, f));
    await backend.putObject(`${rawPrefix}/${f}`, body, "application/x-ndjson");
  }

  const callsPath = join(opts.datasetDir, "call-store", "calls.jsonl");
  try {
    const calls = await readFile(callsPath);
    await backend.putObject(`${rawPrefix}/call-store/calls.jsonl`, calls, "application/x-ndjson");
  } catch {
    /* optional */
  }

  const manifestBody = await readFile(join(opts.datasetDir, "MANIFEST.json"));
  await backend.putObject(manifestKey, manifestBody, "application/json");

  try {
    const schema = await readFile(join(opts.datasetDir, "schema", "openbench-trace.v1.json"));
    await backend.putObject("schema/v1.0.json", schema, "application/json");
  } catch {
    /* optional */
  }

  console.log(
    `Synced ${jsonl.length} traces → ${backend.name === "s3" ? `s3://${bucketLabel}/` : ""}${rawPrefix}/`
  );
  return { rawPrefix, manifestKey, traceFiles: jsonl.length };
}

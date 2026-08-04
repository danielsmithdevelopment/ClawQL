import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDurableBackendFromEnv } from "../backends/s3.js";
import type { DatasetBackend } from "../backends/types.js";

export type SyncDatasetOptions = {
  datasetDir: string;
  runId: string;
  taskId: string;
  /** When true (default), missing R2 config fails. Set false for local dry-runs. */
  requireDurable?: boolean;
  backend?: DatasetBackend;
  dayPrefix?: string;
  fetchFn?: typeof fetch;
  skipEnsure?: boolean;
};

/**
 * Upload a local `dataset/` pack to R2 (or injected backend) using the corpus layout.
 *
 * Auth: CLOUDFLARE_API_TOKEN + account id is enough (auto-ensure bucket + REST put),
 * matching `clawql sync ensure`. Optional CLAWQL_SYNC_* / R2_* S3 keys still work.
 */
export async function syncDatasetPack(opts: SyncDatasetOptions): Promise<{
  rawPrefix: string;
  manifestKey: string;
  traceFiles: number;
  bucket?: string;
  transport?: string;
}> {
  const requireDurable = opts.requireDurable !== false;
  let backend = opts.backend;
  let bucketLabel = "local";
  let transport = "injected";

  if (!backend) {
    const resolved = await resolveDurableBackendFromEnv({
      fetchFn: opts.fetchFn,
      skipEnsure: opts.skipEnsure,
    });
    if (!resolved.ok) {
      const msg =
        `Durable R2 sink required but missing: ${resolved.missing.join(", ")}. ` +
        `Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or CLAWQL_R2_ACCOUNT_ID) ` +
        `— same secrets as team sync ensure — or provide CLAWQL_SYNC_* S3 keys.`;
      if (requireDurable) throw new Error(msg);
      console.warn(msg);
      return { rawPrefix: "", manifestKey: "", traceFiles: 0 };
    }
    backend = resolved.backend;
    bucketLabel = resolved.bucket;
    transport = resolved.transport;
    if (resolved.ensure) {
      console.log(
        `R2 bucket ${resolved.ensure.bucket}: ${
          resolved.ensure.created ? "created" : "exists"
        } via ${resolved.ensure.method}`
      );
    }
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
    `Synced ${jsonl.length} traces → ${
      backend.name === "local" ? "" : `r2://${bucketLabel}/`
    }${rawPrefix}/ (${transport})`
  );
  return {
    rawPrefix,
    manifestKey,
    traceFiles: jsonl.length,
    bucket: bucketLabel === "local" ? undefined : bucketLabel,
    transport,
  };
}

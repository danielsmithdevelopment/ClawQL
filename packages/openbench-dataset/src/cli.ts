#!/usr/bin/env node
/**
 * openbench-dataset CLI (ClawQL reference).
 * Upstream target: `openbench export` / `openbench collect`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { exportHuggingFaceDataset } from "./export/huggingface.js";
import { collectFromResults } from "./collect/from-results.js";
import { syncDatasetPack } from "./sync/sync-pack.js";
import type { OpenBenchTraceV1 } from "./schema/types.js";

function usage(): never {
  console.error(`Usage:
  openbench-dataset collect --artifact-dir <dir> --run-id <id> [--task <id>] [--model <id>]
  openbench-dataset sync --artifact-dir <dir> --run-id <id> --task <id> [--allow-missing-r2]
  openbench-dataset export --source <dir-of-jsonl> --output <dir> [--verdict pass|fail|partial] [--all]
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all" || a === "--allow-missing-r2") out[a.slice(2)] = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? "";
    else if (!out._) out._ = a;
  }
  return out;
}

async function cmdCollect(args: Record<string, string | boolean>): Promise<void> {
  const artifactDir = String(args["artifact-dir"] || "");
  const runId = String(args["run-id"] || "");
  if (!artifactDir || !runId) usage();
  const result = await collectFromResults({
    artifactDir,
    runId,
    taskId: args.task ? String(args.task) : undefined,
    model: args.model ? String(args.model) : undefined,
    clawqlVersion: args["clawql-version"] ? String(args["clawql-version"]) : process.env.GITHUB_SHA,
  });
  console.log(
    `collected traces=${result.traceCount} suitable=${result.suitableCount} call_store=${result.callStoreRecords} → ${result.datasetDir}`
  );
}

async function cmdSync(args: Record<string, string | boolean>): Promise<void> {
  const artifactDir = String(args["artifact-dir"] || "");
  const runId = String(args["run-id"] || "");
  const taskId = String(args.task || "");
  if (!artifactDir || !runId || !taskId) usage();
  const envReq = process.env.CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES?.trim();
  let requireDurable = !args["allow-missing-r2"];
  if (envReq === "0" || envReq === "false") requireDurable = false;
  if (envReq === "1" || envReq === "true") requireDurable = true;
  await syncDatasetPack({
    datasetDir: join(artifactDir, "dataset"),
    runId,
    taskId,
    requireDurable,
  });
}

async function cmdExport(args: Record<string, string | boolean>): Promise<void> {
  const source = String(args.source || "");
  const output = String(args.output || "");
  if (!source || !output) usage();
  const files = readdirSync(source).filter((f) => f.endsWith(".jsonl"));
  const traces: OpenBenchTraceV1[] = [];
  for (const f of files) {
    const text = readFileSync(join(source, f), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      traces.push(JSON.parse(line) as OpenBenchTraceV1);
    }
  }
  const result = await exportHuggingFaceDataset({
    traces,
    outputDir: output,
    verdict: args.verdict as OpenBenchTraceV1["verdict"] | undefined,
    trainingOnly: !args.all,
  });
  console.log(`exported ${result.count} traces → ${result.jsonlPath}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === "collect") await cmdCollect(args);
  else if (cmd === "sync") await cmdSync(args);
  else if (cmd === "export") await cmdExport(args);
  else usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

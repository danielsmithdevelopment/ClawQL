#!/usr/bin/env node
/**
 * openbench-dataset CLI (ClawQL reference).
 * Upstream target command name: `openbench export`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { exportHuggingFaceDataset } from "./export/huggingface.js";
import type { OpenBenchTraceV1 } from "./schema/types.js";

function usage(): never {
  console.error(`Usage:
  openbench-dataset export --source <dir-of-jsonl> --output <dir> [--verdict pass|fail|partial] [--all]

Reads OpenBenchTrace JSONL files from --source and writes a Hugging Face dataset directory.
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all") out.all = true;
    else if (a.startsWith("--")) {
      out[a.slice(2)] = argv[++i] ?? "";
    } else if (!out._) out._ = a;
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "export") usage();
  const args = parseArgs(rest);
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

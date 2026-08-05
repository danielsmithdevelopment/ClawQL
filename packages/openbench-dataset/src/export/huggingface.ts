import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OpenBenchTraceV1 } from "../schema/types.js";

export type ExportOptions = {
  traces: OpenBenchTraceV1[];
  outputDir: string;
  datasetName?: string;
  /** Keep only suitable_for_training when true (default true). */
  trainingOnly?: boolean;
  verdict?: OpenBenchTraceV1["verdict"];
};

/**
 * Write a Hugging Face–friendly directory: data.jsonl + dataset_card.md stub.
 */
export async function exportHuggingFaceDataset(opts: ExportOptions): Promise<{
  jsonlPath: string;
  cardPath: string;
  count: number;
}> {
  let rows = opts.traces;
  if (opts.trainingOnly !== false) {
    rows = rows.filter((t) => t.suitable_for_training);
  }
  if (opts.verdict) {
    rows = rows.filter((t) => t.verdict === opts.verdict);
  }
  await mkdir(opts.outputDir, { recursive: true });
  const jsonlPath = join(opts.outputDir, "data.jsonl");
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await writeFile(jsonlPath, body, "utf8");

  const name = opts.datasetName ?? "openbench-traces";
  const cardPath = join(opts.outputDir, "README.md");
  const card = `---
license: apache-2.0
task_categories:
  - text-generation
tags:
  - openbench
  - agent
  - mcp
  - fine-tune
---

# ${name}

OpenBenchTrace v1.1 export (RTP-compatible). Filter: suitable_for_training=${opts.trainingOnly !== false}${
    opts.verdict ? `, verdict=${opts.verdict}` : ""
  }.

## Provenance

Each record includes \`manifest_id\`, \`content_hash\`, \`redacted_hash\`, scrub metadata,
and an RTP inner session (\`rtp.turnSequence\` + \`rtp.consentToken\`).
See the OpenBenchTrace schema and WORM batch manifests for auditability.

## Citation

Please cite the OpenBenchTrace schema version (\`1.1\`) and the dataset release tag.
`;
  await writeFile(cardPath, card, "utf8");
  return { jsonlPath, cardPath, count: rows.length };
}

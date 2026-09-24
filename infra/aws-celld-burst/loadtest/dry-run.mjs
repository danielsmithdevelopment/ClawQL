#!/usr/bin/env node
/**
 * §13 dry-run loadtest harness — local mock HTTP + summary JSON.
 * Does NOT invent latency/$Y. status is always "dry-run" until a real AWS run.
 *
 * Usage: node infra/aws-celld-burst/loadtest/dry-run.mjs
 */

import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "results");
mkdirSync(outDir, { recursive: true });

const hits = { armA: 0, armB: 0, armC: 0 };

const server = createServer((req, res) => {
  const arm = (req.url ?? "").includes("arm-b")
    ? "armB"
    : (req.url ?? "").includes("arm-c")
      ? "armC"
      : "armA";
  hits[arm] += 1;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, arm, ts: Date.now() }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function burst(armPath, n) {
  for (let i = 0; i < n; i++) {
    await fetch(`http://127.0.0.1:${port}/${armPath}`);
  }
}

await burst("arm-a", 50);
await burst("arm-b", 50);
await burst("arm-c", 50);

server.close();

const summary = {
  status: "dry-run",
  generatedAt: new Date().toISOString(),
  note: "Scaffold only — p50/p99/$Y are null until a real §13 EKS + Cost Explorer run.",
  hits,
  metrics: {
    armA: { p50Ms: null, p99Ms: null, drops: null, costUsd: null },
    armB: { p50Ms: null, p99Ms: null, drops: null, costUsd: null },
    armC: { p50Ms: null, p99Ms: null, drops: null, costUsd: null },
  },
  dollarY: null,
};

const outPath = join(outDir, "dry-run-summary.json");
writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
console.log(`§13 dry-run summary written: ${outPath}`);
console.log(JSON.stringify(summary, null, 2));

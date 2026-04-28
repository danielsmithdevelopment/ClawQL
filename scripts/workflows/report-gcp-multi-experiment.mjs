#!/usr/bin/env node
/**
 * Recompute byte/token stats for docs/experiment-gcp-multi-mcp-workflow.md
 * from docs/workflows/workflow-gcp-multi-latest.json + providers/google/google-top50-apis.json.
 *
 *   node scripts/workflows/report-gcp-multi-experiment.mjs
 *   node scripts/workflows/report-gcp-multi-experiment.mjs --json   # machine-readable only
 *   node scripts/workflows/report-gcp-multi-experiment.mjs --md     # markdown tables to stdout
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT_PATH = join(ROOT, "docs", "workflows", "workflow-gcp-multi-latest.json");
const MANIFEST_PATH = join(ROOT, "providers", "google", "google-top50-apis.json");
const STATS_OUT = join(ROOT, "docs", "experiment-gcp-multi-mcp-stats.json");

function tok(bytes) {
  return Math.ceil(bytes / 4);
}

function sumSearchBytes(obj) {
  let n = 0;
  if (obj.mcpCallToolResult?.content) {
    for (const c of obj.mcpCallToolResult.content) {
      if (c.type === "text" && c.text) n += Buffer.byteLength(c.text, "utf8");
    }
  }
  return n;
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let discoveryBytes = 0;
for (const a of manifest.apis) {
  const p = join(ROOT, "providers", "google", "apis", a.slug, "discovery.json");
  discoveryBytes += readFileSync(p).length;
}

const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
const cross = sumSearchBytes(report.crossCutting);
const perStep = [];
let stepsTotal = 0;
for (const s of report.workflowSteps) {
  const b = sumSearchBytes(s);
  stepsTotal += b;
  perStep.push({
    section: s.section,
    query: s.query,
    responseTextBytes: b,
    approxTokens: tok(b),
  });
}
const totalSearchOut = cross + stepsTotal;
const stats = {
  sourceReport: "docs/workflows/workflow-gcp-multi-latest.json",
  generatedAt: report.meta?.generatedAt ?? null,
  mergedOperationCount: report.meta?.mergedOperationCount ?? null,
  discoveryJsonTotalBytes: discoveryBytes,
  discoveryApproxTokens: tok(discoveryBytes),
  searchCallCount: 1 + report.workflowSteps.length,
  crossCuttingResponseBytes: cross,
  crossCuttingApproxTokens: tok(cross),
  workflowStepsResponseBytesTotal: stepsTotal,
  totalSearchToolOutputBytes: totalSearchOut,
  totalSearchToolOutputApproxTokens: tok(totalSearchOut),
  savingsVsEmbeddingAllDiscoveryJson: {
    discoveryBytes,
    searchOutputBytes: totalSearchOut,
    byteRatio: discoveryBytes / totalSearchOut,
    approxTokensIfPastedAllDiscovery: tok(discoveryBytes),
    approxTokensInSearchOutputs: tok(totalSearchOut),
  },
  perStep,
};

const args = new Set(process.argv.slice(2));
if (args.has("--json")) {
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2), "utf-8");
console.error(`Wrote ${STATS_OUT}`);

if (args.has("--md")) {
  const s = stats;
  console.log(`<!-- Generated from ${s.sourceReport} @ ${s.generatedAt} -->\n`);
  console.log("| Metric | Value |");
  console.log("|--------|-------|");
  console.log(
    `| Sum of curated Google \`discovery.json\` files (on disk) | ${s.discoveryJsonTotalBytes.toLocaleString()} bytes (~${s.discoveryApproxTokens.toLocaleString()} tok†) |`
  );
  console.log(
    `| Sum of 11 × \`search\` tool **text** payloads | ${s.totalSearchToolOutputBytes.toLocaleString()} bytes (~${s.totalSearchToolOutputApproxTokens.toLocaleString()} tok†) |`
  );
  console.log(
    `| Ratio (discovery / search outputs) | **${s.savingsVsEmbeddingAllDiscoveryJson.byteRatio.toFixed(1)}×** |`
  );
  console.log("\n† Approximate tokens: `ceil(bytes / 4)` (rough heuristic for Latin/JSON; not a tokenizer).\n");
  console.log("\n| Step | Response bytes | ~tokens |");
  console.log("|------|----------------|---------|");
  console.log(
    `| Cross-cutting (limit 10) | ${s.crossCuttingResponseBytes.toLocaleString()} | ${s.crossCuttingApproxTokens.toLocaleString()} |`
  );
  for (const row of s.perStep) {
    console.log(
      `| ${row.section.replace(/\|/g, "\\|")} | ${row.responseTextBytes.toLocaleString()} | ${row.approxTokens.toLocaleString()} |`
    );
  }
  process.exit(0);
}

console.log(JSON.stringify(stats, null, 2));

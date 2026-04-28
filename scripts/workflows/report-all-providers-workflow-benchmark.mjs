#!/usr/bin/env node
/**
 * Recompute planning-context stats for docs/benchmarks/all-providers-complex-workflow/
 * from on-disk specs (all-providers merge) + docs/workflows/workflow-complex-release-stack-latest.json.
 *
 *   npm run build && node scripts/workflows/report-all-providers-workflow-benchmark.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_JSON = join(
  ROOT,
  "docs",
  "workflows",
  "workflow-complex-release-stack-latest.json"
);
const STATS_OUT = join(
  ROOT,
  "docs",
  "benchmarks",
  "all-providers-complex-workflow",
  "experiment-all-providers-complex-workflow-stats.json"
);
const MANIFEST = join(ROOT, "providers", "google", "google-top50-apis.json");

function tok(bytes) {
  return Math.ceil(bytes / 4);
}

async function main() {
  const { BUNDLED_PROVIDERS, BUNDLED_MERGED_VENDOR_LABELS } = await import(
    join(ROOT, "dist", "provider-registry.js")
  );

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  let googleTop50DiscoveryBytes = 0;
  for (const a of manifest.apis) {
    const p = join(ROOT, "providers", "google", "apis", a.slug, "discovery.json");
    googleTop50DiscoveryBytes += readFileSync(p).length;
  }

  let vendorOpenApiBytes = 0;
  for (const id of BUNDLED_MERGED_VENDOR_LABELS) {
    const entry = BUNDLED_PROVIDERS[id];
    const rel =
      entry.format === "graphql" ? entry.bundledSchemaSdlPath : entry.bundledSpecPath;
    vendorOpenApiBytes += readFileSync(join(ROOT, rel)).length;
  }

  const totalLoadedSpecBytes = googleTop50DiscoveryBytes + vendorOpenApiBytes;
  const workflowBuf = readFileSync(WORKFLOW_JSON);
  const workflowOutputBytes = workflowBuf.length;

  let wf = {};
  try {
    wf = JSON.parse(workflowBuf.toString("utf8"));
  } catch {
    /* ignore */
  }
  const meta = wf.meta ?? {};
  const searchStepCount = wf.steps?.length ?? null;
  const searchQueryCount =
    wf.steps?.reduce((n, s) => n + (s.queries?.length ?? 0), 0) ?? null;

  const approxTokensIfPastedAllSpecs = tok(totalLoadedSpecBytes);
  const approxTokensInWorkflowOutput = tok(workflowOutputBytes);
  const approxTokensSaved =
    approxTokensIfPastedAllSpecs - approxTokensInWorkflowOutput;
  const percentReduction = (
    (1 - workflowOutputBytes / totalLoadedSpecBytes) *
    100
  ).toFixed(2);
  const byteRatio = totalLoadedSpecBytes / workflowOutputBytes;

  const stats = {
    sourceReport: "docs/workflows/workflow-complex-release-stack-latest.json",
    generatedAt: new Date().toISOString(),
    clawqlProviderPreset: "all-providers",
    mergedOperationCount: meta.mergedOperationCount ?? null,
    providerOperationCounts: meta.providerOperationCounts ?? null,
    specBytes: {
      googleTop50DiscoveryBytes,
      vendorOpenApiBytes,
      totalLoadedSpecBytes,
      totalLoadedSpecApproxTokens: approxTokensIfPastedAllSpecs,
    },
    workflowOutput: {
      source: "docs/workflows/workflow-complex-release-stack-latest.json",
      bytes: workflowOutputBytes,
      approxTokens: approxTokensInWorkflowOutput,
      searchStepCount,
      searchQueryCount,
    },
    savingsVsEmbeddingAllSpecs: {
      specBytes: totalLoadedSpecBytes,
      workflowOutputBytes: workflowOutputBytes,
      byteRatio: Math.round(byteRatio * 1000) / 1000,
      approxTokensIfPastedAllSpecs,
      approxTokensInWorkflowOutput,
      approxTokensSaved,
      percentReduction: parseFloat(percentReduction),
    },
    meta: {
      charsPerToken: 4,
      method:
        "Compare bytes/tokens for full on-disk specs in the all-providers merge vs workflows/workflow-complex-release-stack-latest.json.",
    },
  };

  writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2), "utf-8");
  process.stderr.write(`Wrote ${STATS_OUT}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        totalLoadedSpecBytes,
        workflowOutputBytes,
        approxTokensSaved,
        percentReduction: `${percentReduction}%`,
        compressionRatio: `${byteRatio.toFixed(2)}x`,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

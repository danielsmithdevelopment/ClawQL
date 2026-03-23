#!/usr/bin/env node
/**
 * **Direct** import path (no MCP subprocess): `loadSpec` + `searchOperations` only.
 * Faster for debugging ranking; for what clients see, prefer `npm run workflow:gcp-multi`.
 *
 * Usage: npm run workflow:gcp-multi:direct
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const WORKFLOW_QUERIES = [
  {
    section: "0. Service Usage — enable APIs",
    query: "batch enable services projects serviceusage",
  },
  {
    section: "1. Resource Manager — project IAM",
    query: "get IAM policy project set bindings cloudresourcemanager",
  },
  {
    section: "2. Networking & firewall",
    query: "compute firewall insert network subnet VPC ingress",
  },
  {
    section: "3. GKE cluster",
    query: "create kubernetes cluster regional container locations",
  },
  {
    section: "4. Logging",
    query: "logging sink create export logs BigQuery storage destination",
  },
  {
    section: "5. Monitoring",
    query: "monitoring alert policy notification channel time series",
  },
  {
    section: "6. Load balancing (Compute)",
    query: "global forwarding rule backend service health check url map HTTPS proxy",
  },
  {
    section: "7. Cloud DNS",
    query: "DNS managed zone resource record set create A record",
  },
  {
    section: "8. Cloud Storage",
    query: "storage bucket insert objects upload IAM policy",
  },
  {
    section: "9. BigQuery",
    query: "BigQuery dataset query job insert table",
  },
];

const CROSS_CUTTING_QUERY =
  "enable APIs batch GKE cluster firewall logging monitoring DNS bucket BigQuery";

function hitSummary(h) {
  return {
    score: h.score,
    matchedOn: h.matchedOn,
    operationId: h.operation.id,
    specLabel: h.operation.specLabel ?? null,
    method: h.operation.method,
    path: h.operation.flatPath ?? h.operation.path,
    description: (h.operation.description ?? "").slice(0, 220),
  };
}

async function main() {
  process.env.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";
  process.env.CLAWQL_GOOGLE_TOP20_SPECS = process.env.CLAWQL_GOOGLE_TOP20_SPECS ?? "1";
  delete process.env.CLAWQL_PROVIDER;
  delete process.env.CLAWQL_SPEC_PATH;
  delete process.env.CLAWQL_DISCOVERY_URL;

  const { loadSpec, resetSpecCache } = await import(
    join(ROOT, "dist", "spec-loader.js")
  );
  const { searchOperations } = await import(
    join(ROOT, "dist", "spec-search.js")
  );

  resetSpecCache();
  const { operations, multi } = await loadSpec();

  console.error(
    `[workflow-gcp-multi-direct] Loaded ${operations.length} operations (multi=${multi})`
  );

  const perQuery = [];
  for (const step of WORKFLOW_QUERIES) {
    const hits = searchOperations(operations, step.query, 5);
    perQuery.push({
      section: step.section,
      query: step.query,
      hitCount: hits.length,
      topHits: hits.map(hitSummary),
    });
  }

  const crossHits = searchOperations(operations, CROSS_CUTTING_QUERY, 10);

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      transport: "in-process (not MCP)",
      env: {
        CLAWQL_GOOGLE_TOP20_SPECS: process.env.CLAWQL_GOOGLE_TOP20_SPECS,
        CLAWQL_BUNDLED_OFFLINE: process.env.CLAWQL_BUNDLED_OFFLINE,
      },
      mergedOperationCount: operations.length,
      multi,
    },
    crossCutting: {
      query: CROSS_CUTTING_QUERY,
      hitCount: crossHits.length,
      topHits: crossHits.map(hitSummary),
    },
    workflowSteps: perQuery,
  };

  const dest = join(ROOT, "docs", "workflow-gcp-multi-direct-latest.json");
  await writeFile(dest, JSON.stringify(out, null, 2), "utf-8");

  console.log(JSON.stringify(out, null, 2));
  console.error(`\n[workflow-gcp-multi-direct] Wrote ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

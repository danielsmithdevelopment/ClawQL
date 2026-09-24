#!/usr/bin/env npx tsx
/**
 * Honest post-#1119 remaining-gaps audit.
 *
 * Does NOT invent frontier labels or §13.5 $Y. Prints a machine-readable
 * report and exits 0 always when the audit itself runs (findings carry
 * goalComplete). Exit 2 only on unexpected audit infrastructure failure.
 *
 * Usage: npx tsx scripts/audit-post-1119-remaining-gaps.mts
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";

type Verdict = "DONE" | "PATH_DONE" | "OPEN" | "BLOCKED";
type Row = {
  readonly id: string;
  readonly requirement: string;
  readonly verdict: Verdict;
  readonly evidence: string;
};

const rows: Row[] = [];
const push = (row: Row) => rows.push(row);

function envSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function fileContains(path: string, re: RegExp): boolean {
  if (!existsSync(path)) return false;
  return re.test(readFileSync(path, "utf8"));
}

// --- 1. MCP capability gate default-on ---
{
  const plugin = "packages/clawql-api/src/plugins/capability-lifecycle-plugin.ts";
  const { capabilityLifecyclePluginEnabled } =
    await import("../packages/clawql-api/src/plugins/capability-lifecycle-plugin.ts");
  const prev = process.env.CLAWQL_CAPABILITY_LIFECYCLE;
  delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
  const defaultOn = capabilityLifecyclePluginEnabled();
  process.env.CLAWQL_CAPABILITY_LIFECYCLE = "0";
  const optOut = !capabilityLifecyclePluginEnabled();
  if (prev === undefined) delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
  else process.env.CLAWQL_CAPABILITY_LIFECYCLE = prev;

  push({
    id: "capability-gate-default-on",
    requirement: "MCP capability gate default-on (=0 opt-out)",
    verdict: defaultOn && optOut && fileContains(plugin, /Default \*\*on\*\*/) ? "DONE" : "OPEN",
    evidence: `defaultOn=${defaultOn} optOutWorks=${optOut} plugin=${plugin}`,
  });
}

// --- 2. productionTrusted code gate + current corpus honesty ---
{
  const { runHeldOutValidationSuite, defaultHeldOutSuite } =
    await import("../packages/clawql-core/src/classifier/held-out/index.js");
  const { HeuristicFastDecisionScorerLive } =
    await import("../packages/clawql-core/src/classifier/scorer.js");
  const reports = await Effect.runPromise(
    runHeldOutValidationSuite(defaultHeldOutSuite()).pipe(
      Effect.provide(HeuristicFastDecisionScorerLive)
    )
  );
  const anyTrusted = reports.some((r) => r.productionTrusted);
  const gateSrc = "packages/clawql-core/src/classifier/held-out/run-held-out.ts";
  const gateOk =
    fileContains(gateSrc, /adjudicationKind/) &&
    fileContains(gateSrc, /PRODUCTION_TRUSTED_SCORER_BACKEND|gliner2/);
  // Sidecar must use multi-label classify (entity-extract alone → all-zero scores).
  const sidecar = "infra/gliner-sidecar/app.py";
  const multilabel =
    fileContains(sidecar, /multi_label\s*=\s*True/) &&
    fileContains(sidecar, /classification\(/) &&
    existsSync("infra/gliner-sidecar/test_app.py");

  push({
    id: "productionTrusted-code-gate",
    requirement: "productionTrusted requires live adjudicationKind + gliner2 + criteria",
    verdict: gateOk && multilabel && !anyTrusted ? "DONE" : anyTrusted ? "OPEN" : "PATH_DONE",
    evidence: `gateSrc=${gateOk} multilabelClassify=${multilabel} syntheticTrusted=${anyTrusted} sites=${reports.length}`,
  });
}

// --- 3. Frontier live labels / GLiNER co-run path ---
{
  const frontierWf = ".github/workflows/fast-decision-frontier-adjudication.yml";
  const hasWithGliner =
    fileContains(frontierWf, /with_gliner/) && fileContains(frontierWf, /scorerBackend/);
  const hasAnthropic = envSet("ANTHROPIC_API_KEY");
  const hasOpenRouter = envSet("OPENROUTER_API_KEY");
  const fetch = spawnSync("bash", ["scripts/fetch-frontier-adjudication-artifact.sh"], {
    encoding: "utf8",
  });
  const noLive =
    /No successful frontier adjudication run found/i.test(fetch.stderr + fetch.stdout) ||
    fetch.status !== 0;
  const labelsPath = "artifacts/held-out-frontier-from-gha/held-out-frontier-labels.json";
  const summaryPath = "artifacts/held-out-frontier-from-gha/held-out-frontier-summary.json";
  let liveMode = false;
  let labelCount = 0;
  if (!noLive && existsSync(summaryPath)) {
    try {
      const s = JSON.parse(readFileSync(summaryPath, "utf8")) as {
        adjudicationMode?: string;
        labelCount?: number;
      };
      liveMode = s.adjudicationMode === "live";
      labelCount = typeof s.labelCount === "number" ? s.labelCount : 0;
    } catch {
      liveMode = false;
    }
  }
  if (!liveMode && !noLive && existsSync(labelsPath)) {
    // Summary missing but labels present — still count as live corpus if fetch OK.
    liveMode = true;
  }
  const glinerUrl =
    process.env.CLAWQL_FAST_DECISION_GLINER_URL ??
    (envSet("CLAWQL_GLINER_SIDECAR_HOST")
      ? `http://${process.env.CLAWQL_GLINER_SIDECAR_HOST}:${process.env.CLAWQL_GLINER_SIDECAR_PORT ?? "8080"}`
      : "");
  let glinerHealthz = "unset";
  if (glinerUrl) {
    const hz = spawnSync(
      "curl",
      ["-sf", "-m", "2", `${glinerUrl.replace(/\/$/, "")}/healthz`],
      { encoding: "utf8" }
    );
    glinerHealthz =
      hz.status === 0 && /"backend"\s*:\s*"gliner2"/.test(hz.stdout)
        ? "live-gliner2"
        : `unreachable status=${hz.status}`;
  }

  // Live GHA corpus is DONE when labels exist (local API keys optional — secrets live in GHA).
  push({
    id: "frontier-live-corpus",
    requirement: "Live frontier Sonnet labels exist (productionTrusted corpus)",
    verdict: !noLive && liveMode ? "DONE" : hasWithGliner ? "PATH_DONE" : "OPEN",
    evidence: `workflowWithGliner=${hasWithGliner} ANTHROPIC=${hasAnthropic} OPENROUTER=${hasOpenRouter} fetchNoLive=${noLive} liveMode=${liveMode} labelCount=${labelCount} glinerHealthz=${glinerHealthz}`,
  });
}

// --- 4. K8s watches scaffold ---
{
  const watches = [
    "packages/clawql-k8s-operator/src/watches/pod-informer.ts",
    "packages/clawql-k8s-operator/src/watches/karpenter-nodeclaim-informer.ts",
    "packages/clawql-k8s-operator/src/watches/istio-access-log-tail.ts",
    "packages/clawql-k8s-operator/src/watches/istio-denial-adapter.ts",
    "packages/clawql-k8s-operator/src/watches/celld-fleet-health.ts",
    "packages/clawql-k8s-operator/src/watches/burst-watch-sources.ts",
  ];
  const present = watches.filter((p) => existsSync(p));
  const leaseFetch = existsSync("infra/aws-celld-burst/fetch-celld-leases-from-s3.sh");
  const sourcesWiresFleet =
    existsSync("packages/clawql-k8s-operator/src/watches/burst-watch-sources.ts") &&
    fileContains(
      "packages/clawql-k8s-operator/src/watches/burst-watch-sources.ts",
      /celld-fleet-health|celldLeaseSnapshotJson/
    );
  const leaseOperatorGlue =
    existsSync("scripts/run-burst-watch-from-s3-leases.sh") &&
    existsSync("scripts/burst-watch-from-celld-leases.mts");
  push({
    id: "k8s-watches-scaffold",
    requirement: "K8s BurstWatch + Pod/NodeClaim/Istio/fleet adapters + sources bootstrap",
    verdict:
      present.length === watches.length && leaseFetch && sourcesWiresFleet && leaseOperatorGlue
        ? "DONE"
        : present.length >= 4
          ? "PATH_DONE"
          : "OPEN",
    evidence: `present=${present.length}/${watches.length} leaseFetch=${leaseFetch} sourcesWiresFleet=${sourcesWiresFleet} leaseOperatorGlue=${leaseOperatorGlue}: ${present.map((p) => p.split("/").pop()).join(",")}`,
  });
}

// --- 5. §13 dry-run null $Y + operator chain ---
{
  const dryRun = spawnSync("node", ["infra/aws-celld-burst/loadtest/dry-run.mjs"], {
    encoding: "utf8",
  });
  const summaryPath = "infra/aws-celld-burst/loadtest/results/dry-run-summary.json";
  let dryOk = false;
  if (existsSync(summaryPath)) {
    const s = JSON.parse(readFileSync(summaryPath, "utf8")) as {
      status?: string;
      dollarY?: unknown;
      costUsdY?: unknown;
    };
    // Canonical field is dollarY (dry-run.mjs); costUsdY is never emitted.
    dryOk =
      s.status === "dry-run" &&
      s.dollarY === null &&
      (s.costUsdY === undefined || s.costUsdY === null);
  }
  const ceScript = "infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh";
  const k6Merge = "infra/aws-celld-burst/loadtest/merge-k6-summaries-to-metrics.mjs";
  const fill = "infra/aws-celld-burst/loadtest/fill-result-from-exports.mjs";
  const tools = [ceScript, k6Merge, fill].every((p) => existsSync(p));
  const ceGha =
    fileContains(
      ".github/workflows/aws-celld-burst-section13-dry-run.yml",
      /CLAWQL_CE_ACCESS_KEY_ID/
    ) &&
    fileContains(
      ".github/workflows/aws-celld-burst-section13-dry-run.yml",
      /section13-ce-export|export-cost-explorer-arms/
    ) &&
    fileContains(
      ".github/workflows/aws-celld-burst-section13-dry-run.yml",
      /CLAWQL_CE_ROLE_ARN|role-to-assume/
    );

  push({
    id: "section13-dry-run-and-tools",
    requirement: "§13 dry-run null $Y + CE/k6/fill operator chain",
    verdict: dryOk && tools && ceGha ? "DONE" : dryOk && tools ? "PATH_DONE" : "OPEN",
    evidence: `dryExit=${dryRun.status} dryOk=${dryOk} tools=${tools} ceGha=${ceGha}`,
  });
}

// --- 6. Real AWS §13.5 $Y ---
{
  const aws = process.env.AWS_ACCESS_KEY_ID ?? "";
  const sync = process.env.CLAWQL_SYNC_ACCESS_KEY_ID ?? "";
  const ceKey = process.env.CLAWQL_CE_ACCESS_KEY_ID ?? "";
  const effectiveAws = ceKey || aws;
  const r2Collision = Boolean(effectiveAws) && Boolean(sync) && effectiveAws === sync;
  const hasCeOverride = envSet("CLAWQL_CE_ACCESS_KEY_ID") && envSet("CLAWQL_CE_SECRET_ACCESS_KEY");
  const ce = spawnSync(
    "bash",
    ["infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh", "/tmp/ce-audit-out"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWQL_S13_START: "2026-09-20",
        CLAWQL_S13_END: "2026-09-21",
      },
    }
  );
  const refusedR2 = /R2 sync/i.test(ce.stderr);
  const wroteCsv =
    ce.status === 0 &&
    existsSync("/tmp/ce-audit-out/ce-arm-a.csv") &&
    existsSync("/tmp/ce-audit-out/ce-arm-b.csv") &&
    existsSync("/tmp/ce-audit-out/ce-arm-c.csv");
  const fetchCe = spawnSync("bash", ["scripts/fetch-section13-ce-export-artifact.sh", "/tmp/ce-gha-audit"], {
    encoding: "utf8",
  });
  const ghaCsv =
    fetchCe.status === 0 &&
    existsSync("/tmp/ce-gha-audit/ce-arm-a.csv") &&
    existsSync("/tmp/ce-gha-audit/ce-arm-b.csv") &&
    existsSync("/tmp/ce-gha-audit/ce-arm-c.csv");

  push({
    id: "section13-real-Y",
    requirement: "Real §13.5 $Y from Cost Explorer (not R2, not invented)",
    verdict:
      wroteCsv || ghaCsv
        ? "DONE"
        : r2Collision || refusedR2 || ce.status !== 0
          ? "BLOCKED"
          : "OPEN",
    evidence: `AWS_EQ_SYNC=${aws === sync} CE_override=${hasCeOverride} effectiveEqSync=${r2Collision} ceStatus=${ce.status} refusedR2=${refusedR2} wroteCsv=${wroteCsv} ghaCsv=${ghaCsv}`,
  });
}

const goalComplete = rows.every((r) => r.verdict === "DONE");
const report = {
  generatedAt: new Date().toISOString(),
  objective:
    "Close remaining post-#1119 gaps: frontier adjudication + live GLiNER2, MCP capability gate default-on, K8s watches + Bursty Streams §13",
  goalComplete,
  rows,
  note: goalComplete
    ? "All requirements DONE with live evidence."
    : "In-repo paths may be PATH_DONE; live corpus / real $Y / cluster still required for goalComplete.",
};

const outDir = "artifacts";
mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, "post-1119-remaining-gaps-audit.json");
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");

const md = [
  `# Post-#1119 remaining gaps audit`,
  ``,
  `**Generated:** ${report.generatedAt}`,
  `**goalComplete:** ${goalComplete}`,
  ``,
  `| ID | Requirement | Verdict | Evidence |`,
  `| --- | --- | --- | --- |`,
  ...rows.map(
    (r) => `| ${r.id} | ${r.requirement} | **${r.verdict}** | ${r.evidence.replace(/\|/g, "/")} |`
  ),
  ``,
  report.note,
  ``,
];
const mdPath = join(outDir, "post-1119-remaining-gaps-audit.md");
writeFileSync(mdPath, md.join("\n"));

console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
process.exit(0);

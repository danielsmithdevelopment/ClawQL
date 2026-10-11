#!/usr/bin/env npx tsx
/**
 * Fill Decision-1 v0.4 routing candidate report (measure-only).
 *
 * Usage:
 *   OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-v04-candidate.mts
 *   OUT=…/decision1-v04-routing-candidate.json npx tsx scripts/run-decision1-v04-candidate.mts
 *
 * Flip families default to synonym-only to bound OpenRouter spend on first fills.
 * Set CLAWQL_DECISION1_FLIP_FAMILIES=whitespace,case,punctuation,synonym for full suite.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  routingFreshHeldOutSuiteV04,
  routingFreshHeldOutSuiteV04Path,
} from "clawql-core/classifier";
import {
  runDecision1CandidateReport,
  type Decision1CandidateReport,
} from "../packages/clawql-inference/src/decision/decision1-candidate-report.ts";
import type { FrontierLabelsFile } from "../packages/clawql-inference/src/decision/held-out-to-fanout.ts";
import type { FlipRateFamily } from "../packages/clawql-inference/src/decision/flip-rate.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labelsPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/decision1-v04-routing-candidate.json"
);

function parseFamilies(raw: string | undefined): readonly FlipRateFamily[] {
  if (!raw?.trim()) return ["synonym"];
  const allowed = new Set(["whitespace", "case", "punctuation", "synonym"]);
  const out: FlipRateFamily[] = [];
  for (const part of raw.split(",")) {
    const f = part.trim();
    if (!f) continue;
    if (!allowed.has(f)) throw new Error(`unsupported flip family '${f}'`);
    out.push(f as FlipRateFamily);
  }
  if (out.length === 0) throw new Error("CLAWQL_DECISION1_FLIP_FAMILIES empty");
  return out;
}

async function main(): Promise<void> {
  const suite = routingFreshHeldOutSuiteV04();
  const labels = JSON.parse(readFileSync(labelsPath, "utf8")) as FrontierLabelsFile;
  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  const flipFamilies = parseFamilies(process.env.CLAWQL_DECISION1_FLIP_FAMILIES);
  const hasOr = Boolean(
    process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.CLAWQL_DECISIONS_OPENROUTER_API_KEY?.trim()
  );

  console.log(
    JSON.stringify(
      {
        suiteId: suite.suiteId,
        suitePath: routingFreshHeldOutSuiteV04Path(),
        labelsPath,
        caseCount: suite.cases.length,
        openRouterKeyed: hasOr,
        flipFamilies,
        outPath,
      },
      null,
      2
    )
  );

  const report = await runDecision1CandidateReport({
    suite,
    labels,
    env: process.env,
    flipFamilies,
    allowMissingOpenRouter: true,
  });

  if ("error" in report) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const artifact: Decision1CandidateReport & {
    labelsPath: string;
    filledAt: string;
    flipFamilies: readonly string[];
    openRouterKeyed: boolean;
  } = {
    ...report,
    labelsPath: "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json",
    filledAt: new Date().toISOString(),
    flipFamilies: [...flipFamilies],
    openRouterKeyed: hasOr,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        wrote: outPath,
        productionTrustedClaim: artifact.verdict.productionTrustedClaim,
        bulkReports: artifact.bulk.reports.map((r) => ({
          backendId: r.backendId,
          correct: r.correct,
          wrong: r.wrong,
          answered: r.answered,
          skipped: r.skipped,
          meetsQualityBar: r.meetsQualityBar,
          skipReason: r.skipReason,
        })),
        recommendation: artifact.bulk.recommendation,
        flipRate: {
          passed: artifact.flipRate.passed,
          skipped: artifact.flipRate.skipped ?? false,
          caseCount: artifact.flipRate.caseCount,
          backendId: artifact.flipRate.backendId,
        },
      },
      null,
      2
    )
  );
}

await main();

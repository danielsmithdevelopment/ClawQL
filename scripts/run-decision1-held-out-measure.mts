#!/usr/bin/env npx tsx
/**
 * Measure-only Decision-1 held-out scorer on frozen v0.4 routing labels.
 *
 * Replays live frontier labels via --labels-in, scores with
 * CLAWQL_HELD_OUT_SCORER=openrouter-decision-1, and bounds flip-rate spend
 * with CLAWQL_FLIP_RATE_GATE=0. productionTrusted stays false (backend ≠ gliner2).
 *
 * Usage:
 *   OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-held-out-measure.mts
 *   OUT=…/decision1-v04-held-out-measure.json npx tsx scripts/run-decision1-held-out-measure.mts
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OPENROUTER_DECISION1_SCORER_BACKEND_ID } from "../packages/clawql-inference/src/decision/openrouter-decision1-scorer.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labelsPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/decision1-v04-held-out-measure.json"
);

type HeldOutSummary = {
  suiteId?: string;
  scorerBackend?: string;
  reports?: readonly {
    useSiteId: string;
    productionTrusted: boolean;
    passedCriteria: boolean;
    rawAccuracy: number;
    meanCalibrationError: number;
    failureReasons: readonly string[];
  }[];
};

async function main(): Promise<void> {
  if (!existsSync(labelsPath)) {
    console.error(`missing frozen labels: ${labelsPath}`);
    process.exit(1);
  }
  const hasOr = Boolean(
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.CLAWQL_DECISIONS_OPENROUTER_API_KEY?.trim()
  );
  if (!hasOr) {
    console.error("OPENROUTER_API_KEY (or CLAWQL_DECISIONS_OPENROUTER_API_KEY) required");
    process.exit(1);
  }

  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpSummary = resolve(dirname(outPath), `.decision1-held-out-summary-${process.pid}.json`);

  const env = {
    ...process.env,
    CLAWQL_HELD_OUT_SCORER: "openrouter-decision-1",
    // Bound spend: skip flip-rate re-scores (trust already cannot light).
    CLAWQL_FLIP_RATE_GATE: process.env.CLAWQL_FLIP_RATE_GATE?.trim() || "0",
  };

  console.error(
    JSON.stringify(
      {
        suite: "v0.4-routing-fresh",
        labelsPath,
        outPath,
        scorer: OPENROUTER_DECISION1_SCORER_BACKEND_ID,
        flipRateGate: env.CLAWQL_FLIP_RATE_GATE,
        measureOnly: true,
      },
      null,
      2
    )
  );

  const run = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/run-held-out-adjudication.mts",
      "--suite",
      "v0.4-routing-fresh",
      "--labels-in",
      labelsPath,
      "--out",
      tmpSummary,
    ],
    { cwd: root, env, encoding: "utf8" }
  );
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }

  const raw = JSON.parse(readFileSync(tmpSummary, "utf8")) as {
    summary?: HeldOutSummary;
  } & HeldOutSummary;
  const summary = (raw.summary ?? raw) as HeldOutSummary;
  if (summary.scorerBackend !== OPENROUTER_DECISION1_SCORER_BACKEND_ID) {
    console.error(
      `expected scorerBackend=${OPENROUTER_DECISION1_SCORER_BACKEND_ID}, got ${summary.scorerBackend}`
    );
    process.exit(2);
  }
  const anyTrusted = (summary.reports ?? []).some((r) => r.productionTrusted);
  if (anyTrusted) {
    console.error("fail-closed: Decision-1 measure must not light productionTrusted");
    process.exit(3);
  }

  const artifact = {
    protocol: "Decision-1 held-out measure scorer on frozen v0.4 labels; not productionTrusted",
    filledAt: new Date().toISOString(),
    labelsPath,
    suiteId: summary.suiteId ?? "fast-decision-held-out-v0.4-routing-fresh",
    scorerBackend: summary.scorerBackend,
    flipRateGate: env.CLAWQL_FLIP_RATE_GATE,
    summary,
    honesty: [
      "measure-only — CLAWQL_HELD_OUT_SCORER=openrouter-decision-1",
      `backendId=${OPENROUTER_DECISION1_SCORER_BACKEND_ID} ≠ gliner2`,
      "does not light calibrated or held-out productionTrusted (still GLiNER2-only)",
      "CLAWQL_FLIP_RATE_GATE=0 bounds spend (flip-rate skipped)",
    ],
    verdict: {
      productionTrustedClaim: false,
      calibratedClaim: false,
      citeAs: "Decision-1 held-out measure readout — not a trusted path",
    },
  };

  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.error(`wrote ${outPath}`);
  try {
    unlinkSync(tmpSummary);
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

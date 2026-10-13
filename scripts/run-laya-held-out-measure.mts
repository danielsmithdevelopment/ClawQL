#!/usr/bin/env npx tsx
/**
 * Measure-only Laya held-out scorer on frozen v0.4 routing labels.
 *
 * Self-host only: CLAWQL_LAYA_SYSTEMONE_URL → POST /v1/systemone
 * (pip install "laya[serve]"; LAYA_DEVICE=cpu laya-serve).
 *
 * Usage:
 *   CLAWQL_LAYA_SYSTEMONE_URL=http://127.0.0.1:8000 \
 *     npx tsx scripts/run-laya-held-out-measure.mts
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAYA_BACKEND_ID,
  selfHostedLayaAvailable,
} from "../packages/clawql-inference/src/decision/remote-laya.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labelsPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/laya-v04-held-out-measure.json"
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
  if (!selfHostedLayaAvailable(process.env)) {
    console.error(
      "Laya held-out measure requires self-host: set CLAWQL_LAYA_SYSTEMONE_URL (laya-serve /v1/systemone)."
    );
    process.exit(1);
  }

  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpSummary = resolve(dirname(outPath), `.laya-held-out-summary-${process.pid}.json`);

  const env = {
    ...process.env,
    CLAWQL_HELD_OUT_SCORER: "laya",
    CLAWQL_FLIP_RATE_GATE: process.env.CLAWQL_FLIP_RATE_GATE?.trim() || "0",
  };

  console.error(
    JSON.stringify(
      {
        suite: "v0.4-routing-fresh",
        labelsPath,
        outPath,
        scorer: LAYA_BACKEND_ID,
        flipRateGate: env.CLAWQL_FLIP_RATE_GATE,
        transport: "self-host-systemone",
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
  if (run.status !== 0) process.exit(run.status ?? 1);

  const raw = JSON.parse(readFileSync(tmpSummary, "utf8")) as {
    summary?: HeldOutSummary;
  } & HeldOutSummary;
  const summary = (raw.summary ?? raw) as HeldOutSummary;
  if (summary.scorerBackend !== LAYA_BACKEND_ID) {
    console.error(`expected scorerBackend=${LAYA_BACKEND_ID}, got ${summary.scorerBackend}`);
    process.exit(2);
  }
  if ((summary.reports ?? []).some((r) => r.productionTrusted)) {
    console.error("fail-closed: Laya measure must not light productionTrusted");
    process.exit(3);
  }

  const routing = (summary.reports ?? []).find(
    (r) => r.useSiteId === "search_provider_tool_routing"
  );
  if (routing && routing.rawAccuracy === 0) {
    const reasons = (routing.failureReasons ?? []).join("; ");
    console.error(
      `fail-closed: Laya measure rawAccuracy=0 (likely transport/parse soft-fail). ${reasons}`
    );
    process.exit(4);
  }

  const artifact = {
    protocol: "Laya held-out measure on frozen v0.4 labels; not productionTrusted",
    filledAt: new Date().toISOString(),
    labelsPath,
    suiteId: summary.suiteId ?? "fast-decision-held-out-v0.4-routing-fresh",
    scorerBackend: summary.scorerBackend,
    variant: process.env.CLAWQL_LAYA_MODEL?.trim() || "english",
    flipRateGate: env.CLAWQL_FLIP_RATE_GATE,
    transport: "self-host-systemone",
    summary,
    honesty: [
      "measure-only — CLAWQL_HELD_OUT_SCORER=laya",
      `backendId=${LAYA_BACKEND_ID} ≠ gliner-decide`,
      "self-host SystemOne only (CLAWQL_LAYA_SYSTEMONE_URL) — CPU-class encoder peer to GLiNER",
      "does not light calibrated or held-out productionTrusted",
      "CLAWQL_FLIP_RATE_GATE=0 bounds spend (flip-rate skipped)",
    ],
    verdict: {
      productionTrustedClaim: false,
      calibratedClaim: false,
      citeAs: "Laya held-out measure readout — not a trusted path",
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

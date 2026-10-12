#!/usr/bin/env npx tsx
/**
 * Measure-only Clef / Clef-Flash held-out scorer on frozen v0.4 routing labels.
 *
 * Replays live frontier labels, scores with CLAWQL_HELD_OUT_SCORER=clef-flash
 * (or clef), CLAWQL_FLIP_RATE_GATE=0. productionTrusted stays false.
 *
 * Transport (self-host only — Workers AI is refused):
 *   CLAWQL_CLEF_SYSTEMONE_URL → POST {base}/v1/systemone
 *   Launch: infra/clef-systemone (SGLang Cloudflare/clef-flash)
 *
 * Usage:
 *   CLAWQL_CLEF_SYSTEMONE_URL=http://127.0.0.1:30000 \
 *     npx tsx scripts/run-clef-held-out-measure.mts
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clefBackendId,
  resolveClefVariant,
  selfHostedClefAvailable,
} from "../packages/clawql-inference/src/decision/remote-clef.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labelsPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/clef-v04-held-out-measure.json"
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
  if (!selfHostedClefAvailable(process.env)) {
    console.error(
      "Clef held-out measure requires self-host: set CLAWQL_CLEF_SYSTEMONE_URL (SGLang /v1/systemone). Workers AI is not used."
    );
    process.exit(1);
  }

  const variant = resolveClefVariant(process.env.CLAWQL_CLEF_MODEL?.trim() || "clef-flash");
  const scorerEnv = variant === "clef" ? "clef" : "clef-flash";
  const expectedBackend = clefBackendId(variant);
  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpSummary = resolve(dirname(outPath), `.clef-held-out-summary-${process.pid}.json`);

  const env = {
    ...process.env,
    CLAWQL_HELD_OUT_SCORER: scorerEnv,
    CLAWQL_CLEF_MODEL: variant,
    CLAWQL_FLIP_RATE_GATE: process.env.CLAWQL_FLIP_RATE_GATE?.trim() || "0",
  };

  console.error(
    JSON.stringify(
      {
        suite: "v0.4-routing-fresh",
        labelsPath,
        outPath,
        scorer: expectedBackend,
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
  if (summary.scorerBackend !== expectedBackend) {
    console.error(`expected scorerBackend=${expectedBackend}, got ${summary.scorerBackend}`);
    process.exit(2);
  }
  if ((summary.reports ?? []).some((r) => r.productionTrusted)) {
    console.error("fail-closed: Clef measure must not light productionTrusted");
    process.exit(3);
  }

  const routing = (summary.reports ?? []).find(
    (r) => r.useSiteId === "search_provider_tool_routing"
  );
  if (routing && routing.rawAccuracy === 0) {
    const reasons = (routing.failureReasons ?? []).join("; ");
    console.error(
      `fail-closed: Clef measure rawAccuracy=0 (likely transport/parse soft-fail). ${reasons}`
    );
    process.exit(4);
  }

  const artifact = {
    protocol: "Clef held-out measure on frozen v0.4 labels; not productionTrusted",
    filledAt: new Date().toISOString(),
    labelsPath,
    suiteId: summary.suiteId ?? "fast-decision-held-out-v0.4-routing-fresh",
    scorerBackend: summary.scorerBackend,
    variant,
    flipRateGate: env.CLAWQL_FLIP_RATE_GATE,
    transport: "self-host-systemone",
    summary,
    honesty: [
      `measure-only — CLAWQL_HELD_OUT_SCORER=${scorerEnv}`,
      `backendId=${expectedBackend} ≠ gliner2`,
      "self-host SystemOne only (CLAWQL_CLEF_SYSTEMONE_URL) — Workers AI refused for this fill",
      "does not light calibrated or held-out productionTrusted",
      "CLAWQL_FLIP_RATE_GATE=0 bounds spend (flip-rate skipped)",
    ],
    verdict: {
      productionTrustedClaim: false,
      calibratedClaim: false,
      citeAs: "Clef held-out measure readout — not a trusted path",
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

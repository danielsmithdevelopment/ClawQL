#!/usr/bin/env npx tsx
/**
 * Compare Clef held-out measure vs frozen GLiNER2 productionTrusted readout (v0.4).
 *
 * Does not re-run GLiNER — cites v0.4-routing-fresh-productionTrusted-readout.json.
 * Optionally runs Clef measure first when RUN_CLEF=1.
 *
 * Usage:
 *   RUN_CLEF=1 CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
 *     npx tsx scripts/run-clef-vs-gliner-compare.mts
 *   CLEF_MEASURE=…/clef-v04-held-out-measure.json \
 *     npx tsx scripts/run-clef-vs-gliner-compare.mts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const glinerPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-productionTrusted-readout.json"
);
const defaultClefPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/clef-v04-held-out-measure.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/clef-vs-gliner-v04-compare.json"
);

type GlinerReadout = {
  scorerBackend?: string;
  rawAccuracy?: number;
  meanCalibrationError?: number;
  passedCriteria?: boolean;
  productionTrusted?: boolean;
  n?: number;
  coverageAtTau?: number;
  acceptedCount?: number;
  amongAcceptedAcc?: number;
  tau?: number;
};

type ClefArtifact = {
  scorerBackend?: string;
  variant?: string;
  transport?: string;
  summary?: {
    reports?: readonly {
      useSiteId: string;
      rawAccuracy: number;
      meanCalibrationError: number;
      passedCriteria: boolean;
      productionTrusted: boolean;
      caseCount: number;
      failureReasons: readonly string[];
    }[];
  };
};

function main(): void {
  if (process.env.RUN_CLEF?.trim() === "1") {
    const r = spawnSync("npx", ["tsx", "scripts/run-clef-held-out-measure.mts"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const clefPath = resolve(process.env.CLEF_MEASURE?.trim() || defaultClefPath);
  if (!existsSync(clefPath)) {
    console.error(`missing Clef measure artifact: ${clefPath} (set RUN_CLEF=1 or CLEF_MEASURE=)`);
    process.exit(1);
  }
  if (!existsSync(glinerPath)) {
    console.error(`missing GLiNER readout: ${glinerPath}`);
    process.exit(1);
  }

  const gliner = JSON.parse(readFileSync(glinerPath, "utf8")) as GlinerReadout;
  const clef = JSON.parse(readFileSync(clefPath, "utf8")) as ClefArtifact;
  const routing = (clef.summary?.reports ?? []).find(
    (r) => r.useSiteId === "search_provider_tool_routing"
  );
  if (!routing) {
    console.error("Clef artifact missing search_provider_tool_routing report");
    process.exit(2);
  }

  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  mkdirSync(dirname(outPath), { recursive: true });

  const compare = {
    protocol: "Clef vs GLiNER2 on frozen v0.4 routing held-out — measure, not trust transfer",
    comparedAt: new Date().toISOString(),
    suiteId: "fast-decision-held-out-v0.4-routing-fresh",
    useSiteId: "search_provider_tool_routing",
    arms: {
      gliner2: {
        source: glinerPath,
        scorerBackend: gliner.scorerBackend ?? "gliner2",
        n: gliner.n,
        rawAccuracy: gliner.rawAccuracy,
        meanCalibrationError: gliner.meanCalibrationError,
        passedCriteria: gliner.passedCriteria,
        productionTrusted: gliner.productionTrusted,
        tau: gliner.tau,
        coverageAtTau: gliner.coverageAtTau,
        acceptedCount: gliner.acceptedCount,
        amongAcceptedAcc: gliner.amongAcceptedAcc,
      },
      clef: {
        source: clefPath,
        scorerBackend: clef.scorerBackend,
        variant: clef.variant,
        transport: clef.transport,
        n: routing.caseCount,
        rawAccuracy: routing.rawAccuracy,
        meanCalibrationError: routing.meanCalibrationError,
        passedCriteria: routing.passedCriteria,
        productionTrusted: routing.productionTrusted,
        failureReasons: routing.failureReasons,
      },
    },
    deltas: {
      rawAccuracy: routing.rawAccuracy - (gliner.rawAccuracy ?? 0),
      meanCalibrationError: routing.meanCalibrationError - (gliner.meanCalibrationError ?? 0),
    },
    winnerRawAccuracy:
      routing.rawAccuracy > (gliner.rawAccuracy ?? 0)
        ? "clef"
        : routing.rawAccuracy < (gliner.rawAccuracy ?? 0)
          ? "gliner2"
          : "tie",
    honesty: [
      "GLiNER arm is the frozen productionTrusted readout (live sidecar + criteria + flip).",
      "Clef arm is measure-only (backend ≠ gliner2) — cannot light productionTrusted under current gate.",
      "Official stack prefers self-hosted Clef (Apache-2.0); Workers AI is fill transport only.",
      "Among-accepted@τ is GLiNER policy semantics — Clef measure reports forced top-1 rawAccuracy.",
    ],
    verdict: {
      productionTrustedClaim: false,
      citeAs: "Clef vs GLiNER v0.4 comparative measure — not a trusted-path swap",
    },
  };

  writeFileSync(outPath, JSON.stringify(compare, null, 2) + "\n");
  console.log(JSON.stringify(compare, null, 2));
  console.error(`wrote ${outPath}`);
}

main();

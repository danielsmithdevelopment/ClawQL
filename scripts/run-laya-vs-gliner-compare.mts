#!/usr/bin/env npx tsx
/**
 * Compare Laya held-out measure vs frozen GLiNER2 productionTrusted readout (v0.4).
 *
 * Usage:
 *   RUN_LAYA=1 CLAWQL_LAYA_SYSTEMONE_URL=http://127.0.0.1:8000 \
 *     npx tsx scripts/run-laya-vs-gliner-compare.mts
 *   LAYA_MEASURE=…/laya-v04-held-out-measure.json \
 *     npx tsx scripts/run-laya-vs-gliner-compare.mts
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
const defaultLayaPath = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/laya-v04-held-out-measure.json"
);
const defaultOut = resolve(
  root,
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/laya-vs-gliner-v04-compare.json"
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

type LayaArtifact = {
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
  if (process.env.RUN_LAYA?.trim() === "1") {
    const r = spawnSync("npx", ["tsx", "scripts/run-laya-held-out-measure.mts"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const layaPath = resolve(process.env.LAYA_MEASURE?.trim() || defaultLayaPath);
  if (!existsSync(layaPath)) {
    console.error(`missing Laya measure artifact: ${layaPath} (set RUN_LAYA=1 or LAYA_MEASURE=)`);
    process.exit(1);
  }
  if (!existsSync(glinerPath)) {
    console.error(`missing GLiNER readout: ${glinerPath}`);
    process.exit(1);
  }

  const gliner = JSON.parse(readFileSync(glinerPath, "utf8")) as GlinerReadout;
  const laya = JSON.parse(readFileSync(layaPath, "utf8")) as LayaArtifact;
  const routing = (laya.summary?.reports ?? []).find(
    (r) => r.useSiteId === "search_provider_tool_routing"
  );
  if (!routing) {
    console.error("Laya artifact missing search_provider_tool_routing report");
    process.exit(2);
  }

  const outPath = resolve(process.env.OUT?.trim() || defaultOut);
  mkdirSync(dirname(outPath), { recursive: true });

  const compare = {
    protocol:
      "Laya vs GLiNER Decide family on frozen v0.4 routing held-out — measure, not trust transfer",
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
      laya: {
        source: layaPath,
        scorerBackend: laya.scorerBackend,
        variant: laya.variant,
        transport: laya.transport,
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
        ? "laya"
        : routing.rawAccuracy < (gliner.rawAccuracy ?? 0)
          ? "gliner2"
          : "tie",
    honesty: [
      "GLiNER arm is the frozen productionTrusted readout (live sidecar + criteria + flip); historical scorerBackend may still say gliner2 — canonical id is now gliner-decide.",
      "Laya arm is measure-only (backend ≠ gliner-decide) — cannot light productionTrusted under current gate.",
      "Both arms are CPU-class Apache-2.0 encoders; Laya served via self-host SystemOne.",
      "Among-accepted@τ is GLiNER policy semantics — Laya measure reports forced top-1 rawAccuracy.",
    ],
    verdict: {
      productionTrustedClaim: false,
      citeAs: "Laya vs GLiNER v0.4 comparative measure — not a trusted-path swap",
    },
  };

  writeFileSync(outPath, JSON.stringify(compare, null, 2) + "\n");
  console.log(JSON.stringify(compare, null, 2));
  console.error(`wrote ${outPath}`);
}

main();

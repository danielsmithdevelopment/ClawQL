/**
 * CLI: run the fair parked-agent density board and write evidence-fair.json.
 *
 *   npx tsx packages/clawql-api/src/program/density/fair-board-cli.ts [outPath]
 *
 * Env:
 *   CLAWQL_DENSITY_BAG_DIR, CLAWQL_DENSITY_RSS_CEILING_MIB,
 *   CLAWQL_DENSITY_RAMP (comma-separated), CLAWQL_DENSITY_WAKE_SAMPLE,
 *   CLAWQL_DENSITY_SKIP_COLD=1, CLAWQL_DENSITY_SKIP_RESTART=1,
 *   CLAWQL_DENSITY_HOST_LABEL
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { runFairDensityBoardEffect, writeEvidenceFairEffect } from "./fair-board.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const defaultOut = join(repoRoot, "docs/benchmarks/program-density/evidence-fair.json");

function parseRamp(raw: string | undefined): number[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function main(): Promise<void> {
  const outPath = process.argv[2] || process.env.CLAWQL_DENSITY_EVIDENCE_PATH || defaultOut;
  mkdirSync(dirname(outPath), { recursive: true });

  const evidence = await Effect.runPromise(
    runFairDensityBoardEffect({
      rssCeilingMiB: process.env.CLAWQL_DENSITY_RSS_CEILING_MIB
        ? Number(process.env.CLAWQL_DENSITY_RSS_CEILING_MIB)
        : 512,
      rampSchedule: parseRamp(process.env.CLAWQL_DENSITY_RAMP),
      wakeSampleSize: process.env.CLAWQL_DENSITY_WAKE_SAMPLE
        ? Number(process.env.CLAWQL_DENSITY_WAKE_SAMPLE)
        : 200,
      skipCold: process.env.CLAWQL_DENSITY_SKIP_COLD === "1",
      skipRestart: process.env.CLAWQL_DENSITY_SKIP_RESTART === "1",
      hostLabel: process.env.CLAWQL_DENSITY_HOST_LABEL || "clawql-cloud-agent-host",
      bagDir: process.env.CLAWQL_DENSITY_BAG_DIR,
    })
  );

  await Effect.runPromise(writeEvidenceFairEffect(evidence, outPath));
  const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
  const cols = clawql?.boardColumns;
  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        agentsAtLimit: cols?.agentsAtLimit,
        residentKiBPerAgent: cols?.residentKiBPerAgent,
        diskBytesPerAgent: cols?.diskBytesPerAgent,
        wakeWarmMs: cols?.wakeWarmMs,
        wakeColdMs: cols?.wakeColdMs,
        restartSurvival: cols?.restartSurvival,
        limitReason: evidence.clawqlRun?.limitReason,
      },
      null,
      2
    ) + "\n"
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

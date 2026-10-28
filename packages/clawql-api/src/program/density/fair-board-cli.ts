/**
 * CLI: run the fair parked-agent density board and write evidence-fair.json.
 *
 *   node --expose-gc --import tsx packages/clawql-api/src/program/density/fair-board-cli.ts [outPath]
 *
 * Env:
 *   CLAWQL_DENSITY_BAG_DIR, CLAWQL_DENSITY_RSS_CEILING_MIB,
 *   CLAWQL_DENSITY_RAMP (comma-separated; disables auto-continue),
 *   CLAWQL_DENSITY_CONTINUE_UNTIL_CEILING=0 to stop at schedule end,
 *   CLAWQL_DENSITY_WAKE_SAMPLE, CLAWQL_DENSITY_WAKE_WARMUP,
 *   CLAWQL_DENSITY_WAKE_ORDER_REPS (default 3),
 *   CLAWQL_DENSITY_COLD_P99_CEILING_MS (optional latency limit),
 *   CLAWQL_DENSITY_SKIP_COLD=1, CLAWQL_DENSITY_SKIP_RESTART=1,
 *   CLAWQL_DENSITY_HOST_LABEL,
 *   CLAWQL_DENSITY_REUSE_BAGS=1, CLAWQL_DENSITY_RESUME_FROM
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

  const rampSchedule = parseRamp(process.env.CLAWQL_DENSITY_RAMP);
  const evidence = await Effect.runPromise(
    runFairDensityBoardEffect({
      rssCeilingMiB: process.env.CLAWQL_DENSITY_RSS_CEILING_MIB
        ? Number(process.env.CLAWQL_DENSITY_RSS_CEILING_MIB)
        : 512,
      rampSchedule,
      continueUntilCeiling:
        process.env.CLAWQL_DENSITY_CONTINUE_UNTIL_CEILING === "0"
          ? false
          : rampSchedule
            ? false
            : true,
      wakeSampleSize: process.env.CLAWQL_DENSITY_WAKE_SAMPLE
        ? Number(process.env.CLAWQL_DENSITY_WAKE_SAMPLE)
        : 200,
      wakeWarmupCount: process.env.CLAWQL_DENSITY_WAKE_WARMUP
        ? Number(process.env.CLAWQL_DENSITY_WAKE_WARMUP)
        : undefined,
      wakeOrderRepetitions: process.env.CLAWQL_DENSITY_WAKE_ORDER_REPS
        ? Number(process.env.CLAWQL_DENSITY_WAKE_ORDER_REPS)
        : 3,
      wakeColdP99CeilingMs: process.env.CLAWQL_DENSITY_COLD_P99_CEILING_MS
        ? Number(process.env.CLAWQL_DENSITY_COLD_P99_CEILING_MS)
        : undefined,
      skipCold: process.env.CLAWQL_DENSITY_SKIP_COLD === "1",
      skipRestart: process.env.CLAWQL_DENSITY_SKIP_RESTART === "1",
      hostLabel: process.env.CLAWQL_DENSITY_HOST_LABEL || "clawql-cloud-agent-host",
      bagDir: process.env.CLAWQL_DENSITY_BAG_DIR,
      reuseBags: process.env.CLAWQL_DENSITY_REUSE_BAGS === "1",
      resumeFromAgents: process.env.CLAWQL_DENSITY_RESUME_FROM
        ? Number(process.env.CLAWQL_DENSITY_RESUME_FROM)
        : undefined,
    })
  );

  await Effect.runPromise(writeEvidenceFairEffect(evidence, outPath));
  const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
  const cols = clawql?.boardColumns;
  const run = evidence.clawqlRun;
  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        status: clawql?.status,
        agentsAtLimit: cols?.agentsAtLimit,
        limitResource: cols?.limitResource,
        limitHit: run?.limitHit,
        ceilingHit: run?.ceilingHit,
        idIndexRetainedAtLimit: run?.idIndexRetainedAtLimit,
        idIndexEntries: run?.residentAccounting.idIndexEntries,
        rssCeilingDefinition: run?.rssCeilingDefinition,
        residentKiBPerAgent: cols?.residentKiBPerAgent,
        heapUsedKiBPerAgentAfterGc: run?.residentAccounting.heapUsedKiBPerAgentAfterGc,
        rssDeltaKiBPerAgent: run?.residentAccounting.rssDeltaKiBPerAgent,
        pageCacheKiBPerAgent: cols?.pageCacheKiBPerAgent,
        diskBytesPerAgent: cols?.diskBytesPerAgent,
        wakeWarmMs: cols?.wakeWarmMs,
        wakeColdMs: cols?.wakeColdMs,
        wakeHeadlineOrder: run?.wakeHeadlineOrder,
        wakeOrderRepetitions: run?.wakeOrderRepetitions,
        wakeSpread: run?.wakeSpread,
        wakeByOrder: run?.wakeByOrder.map((o) => ({
          order: o.order,
          repetition: o.repetition,
          warmP99: o.warm.p99,
          coldP99: o.cold.p99,
          gcWarmMaxMs: o.gcWarm.maxMs,
          gcColdMaxMs: o.gcCold.maxMs,
        })),
        coldFasterThanWarmP99: run?.wakePooled.coldFasterThanWarmP99,
        restartSurvival: cols?.restartSurvival,
        exposeGc: run?.exposeGc,
        limitReason: run?.limitReason,
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

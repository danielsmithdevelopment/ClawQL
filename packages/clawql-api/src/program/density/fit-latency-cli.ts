/**
 * CLI: ClawQL resident fit-latency under 8G (publishable:true, host disclosed).
 *
 *   node --expose-gc --max-old-space-size=8192 --import tsx \
 *     packages/clawql-api/src/program/density/fit-latency-cli.ts [outPath]
 *
 * Env: CLAWQL_FIT_BASELINE, CLAWQL_FIT_LASTFIT, CLAWQL_FIT_STEP,
 *      CLAWQL_FIT_PROBE_SAMPLE, CLAWQL_FIT_PROBE_EVERY, CLAWQL_FIT_CGROUP
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { runClawqlFitLatencyEffect, writeFitLatencyEvidenceEffect } from "./fit-latency.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const defaultOut = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/evidence-clawql-fit-latency.json"
);

async function main(): Promise<void> {
  const outPath = process.argv[2] || process.env.CLAWQL_FIT_OUT || defaultOut;
  const evidence = await Effect.runPromise(
    Effect.gen(function* () {
      const result = yield* runClawqlFitLatencyEffect({
        baselineAgents: Number(process.env.CLAWQL_FIT_BASELINE || 2_500),
        lastFitTarget: Number(process.env.CLAWQL_FIT_LASTFIT || 100_000),
        step: Number(process.env.CLAWQL_FIT_STEP || 2_500),
        probeSample: Number(process.env.CLAWQL_FIT_PROBE_SAMPLE || 100),
        probeTurns: Number(process.env.CLAWQL_FIT_PROBE_TURNS || 1),
        // 0 / huge = probe only at baseline + lastFit (avoids heap fragmentation near cap).
        probeEverySteps: Number(process.env.CLAWQL_FIT_PROBE_EVERY || 10_000),
        ceilingMultiple: Number(process.env.CLAWQL_FIT_CEILING || 2),
        cgroupPath: process.env.CLAWQL_FIT_CGROUP || null,
        bagRoot: process.env.CLAWQL_FIT_BAG || "/tmp/clawql-fit-latency",
        outPath,
      });
      yield* writeFitLatencyEvidenceEffect(result, outPath);
      return result;
    })
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        publishable: evidence.publishable,
        baseline: {
          agents: evidence.baseline.agents,
          p50Ms: evidence.baseline.turn.p50Ms,
          p99Ms: evidence.baseline.turn.p99Ms,
          turnsPerSec: evidence.baseline.turn.turnsPerSec,
        },
        atLastFit: evidence.atLastFit
          ? {
              agents: evidence.atLastFit.agents,
              p50Ms: evidence.atLastFit.turn.p50Ms,
              p99Ms: evidence.atLastFit.turn.p99Ms,
              turnsPerSec: evidence.atLastFit.turn.turnsPerSec,
              within2x: evidence.atLastFit.within2xOfBaseline,
            }
          : null,
        highestNWithin2x: evidence.highestNWithin2x,
        peakMemKiBPerAgentAtLastFit: evidence.peakMemKiBPerAgentAtLastFit,
        nodeFlags: evidence.tuning.nodeFlags,
        oomOrAbort: evidence.oomOrAbort,
        reading: evidence.reading,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * CLI: measure ClawQL offloaded page-cache + warm/cold wake (publishable:true, host disclosed).
 *
 *   node --expose-gc --import tsx \
 *     packages/clawql-api/src/program/density/offloaded-tradeoff-cli.ts [outPath]
 *
 * Env:
 *   CLAWQL_OFFLOAD_AGENTS=500
 *   CLAWQL_OFFLOAD_WAKE_SAMPLE=200
 *   CLAWQL_OFFLOAD_WAKE_REPS=3
 *   CLAWQL_OFFLOAD_BAG_ROOT=/tmp/clawql-offloaded-tradeoff
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  runOffloadedTradeoffEffect,
  writeOffloadedTradeoffEvidenceEffect,
} from "./offloaded-tradeoff.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const defaultOut = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/evidence-offloaded-tradeoff.json"
);

async function main(): Promise<void> {
  const outPath = process.argv[2] || process.env.CLAWQL_OFFLOAD_OUT || defaultOut;
  const agentCount = Math.max(1, Number(process.env.CLAWQL_OFFLOAD_AGENTS || 500));
  const wakeSampleSize = Math.max(1, Number(process.env.CLAWQL_OFFLOAD_WAKE_SAMPLE || 200));
  const wakeOrderRepetitions = Math.max(1, Number(process.env.CLAWQL_OFFLOAD_WAKE_REPS || 3));
  const bagRoot = process.env.CLAWQL_OFFLOAD_BAG_ROOT || "/tmp/clawql-offloaded-tradeoff";

  const evidence = await Effect.runPromise(
    Effect.gen(function* () {
      const result = yield* runOffloadedTradeoffEffect({
        agentCount,
        wakeSampleSize,
        wakeOrderRepetitions,
        bagRoot,
      });
      yield* writeOffloadedTradeoffEvidenceEffect(result, outPath);
      return result;
    })
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        publishable: evidence.publishable,
        agentsParked: evidence.population.agentsParked,
        diskBytesPerAgent: evidence.population.diskBytesPerAgent,
        pageCacheKiBPerAgent: evidence.pageCache.afterParkKiBPerAgent,
        wakeWarmMs: evidence.wake.warmMs,
        wakeColdMs: evidence.wake.coldMs,
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

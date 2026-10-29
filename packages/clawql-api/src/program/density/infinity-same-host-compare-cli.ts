/**
 * CLI: same-host Infinity vs ClawQL density (Pi hardware deferred).
 *
 *   node --expose-gc --import tsx \
 *     packages/clawql-api/src/program/density/infinity-same-host-compare-cli.ts [outPath]
 *
 * Env:
 *   CLAWQL_INFINITY_COMPARE_NS=1000,5000,10000
 *   CLAWQL_INFINITY_COMPARE_BAG_ROOT=/tmp/clawql-infinity-same-host
 *   CLAWQL_INFINITY_EVIDENCE=docs/benchmarks/program-density/infinity-on-pi/evidence-agent-scale.json
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  loadInfinityColumnFromEvidenceEffect,
  runInfinitySameHostCompareEffect,
  writeInfinitySameHostEvidenceEffect,
} from "./infinity-same-host-compare.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const defaultOut = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/evidence-same-host-density.json"
);
const defaultInfinityEvidence = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/evidence-agent-scale.json"
);

function parseNs(raw: string | undefined): number[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function main(): Promise<void> {
  const outPath = process.argv[2] || process.env.CLAWQL_INFINITY_COMPARE_OUT || defaultOut;
  const infinityPath = process.env.CLAWQL_INFINITY_EVIDENCE || defaultInfinityEvidence;
  const clawqlNs = parseNs(process.env.CLAWQL_INFINITY_COMPARE_NS);
  const bagRoot = process.env.CLAWQL_INFINITY_COMPARE_BAG_ROOT;

  const evidence = await Effect.runPromise(
    Effect.gen(function* () {
      const infinity = yield* loadInfinityColumnFromEvidenceEffect(
        infinityPath,
        "docs/benchmarks/program-density/infinity-on-pi/evidence-agent-scale.json"
      );
      const result = yield* runInfinitySameHostCompareEffect({
        clawqlNs,
        bagRoot,
        infinity,
      });
      yield* writeInfinitySameHostEvidenceEffect(result, outPath);
      return result;
    })
  );

  const match =
    evidence.clawql.samples.find((s) => s.agents === evidence.infinity.agents) ??
    evidence.clawql.samples[evidence.clawql.samples.length - 1]!;
  console.log(
    JSON.stringify(
      {
        outPath,
        infinityKiBPerAgent: evidence.infinity.kibPerAgent,
        clawqlResidentKiBPerAgent: match.residentKiBPerAgent,
        clawqlDiskBytesPerAgent: match.diskBytesPerAgent,
        agents: match.agents,
        piHardware: evidence.contract.piHardware,
        reading: evidence.reading,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

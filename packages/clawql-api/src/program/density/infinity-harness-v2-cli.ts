/**
 * CLI: Infinity × ClawQL density harness v2 (publishable:false).
 *
 *   node --expose-gc --import tsx \
 *     packages/clawql-api/src/program/density/infinity-harness-v2-cli.ts [outPath]
 *
 * Env:
 *   CLAWQL_HARNESS_NS=1000,5000,10000
 *   CLAWQL_HARNESS_REPS=1
 *   CLAWQL_HARNESS_INFINITY_CSV=/path/to/agent_scale.csv  (optional, merges Infinity slope)
 *   CLAWQL_HARNESS_INFINITY_FIXTURE=docs/.../infinity-agent-0-msgs-only.json
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  infinityCsvToSlopeSampleEffect,
  runHarnessV2ClawqlEffect,
  writeHarnessV2EvidenceEffect,
  type SlopeSample,
} from "./infinity-harness-v2.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const defaultOut = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/evidence-harness-v2.json"
);
const defaultFixture = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/fixtures/infinity-agent-0-msgs-only.json"
);

function parseNs(raw: string | undefined): number[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function main(): Promise<void> {
  const outPath = process.argv[2] || process.env.CLAWQL_HARNESS_OUT || defaultOut;
  const nSchedule = parseNs(process.env.CLAWQL_HARNESS_NS);
  const reps = Math.max(1, Number(process.env.CLAWQL_HARNESS_REPS || 1));
  const fixture = process.env.CLAWQL_HARNESS_INFINITY_FIXTURE || defaultFixture;
  const csvPath = process.env.CLAWQL_HARNESS_INFINITY_CSV;

  const infinitySlopeSamples: SlopeSample[] = [];
  if (csvPath) {
    const csv = readFileSync(csvPath, "utf8");
    // Support multiple CSV blobs separated by ---rep=N---
    const chunks = csv.split(/^---rep=(\d+)---$/m);
    if (chunks.length === 1) {
      infinitySlopeSamples.push(await Effect.runPromise(infinityCsvToSlopeSampleEffect(csv, 1)));
    } else {
      for (let i = 1; i < chunks.length; i += 2) {
        const rep = Number(chunks[i]);
        const body = chunks[i + 1] ?? "";
        infinitySlopeSamples.push(
          await Effect.runPromise(infinityCsvToSlopeSampleEffect(body, rep))
        );
      }
    }
  }

  const evidence = await Effect.runPromise(
    Effect.gen(function* () {
      const result = yield* runHarnessV2ClawqlEffect({
        nSchedule,
        reps,
        infinityFixturePath: fixture,
        infinitySlopeSamples,
        fairV2DiskBytesForContrast: 32_859,
      });
      yield* writeHarnessV2EvidenceEffect(result, outPath);
      return result;
    })
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        publishable: evidence.publishable,
        byteParity: {
          infinityBytes: evidence.byteParity.infinity.serdeJsonMsgsBytes,
          clawqlMatchedBytes: evidence.byteParity.clawqlMatched.serializedJsonBytes,
          fairV2ContrastBytes: evidence.byteParity.fairV2DiskBytesForContrast,
        },
        floors: evidence.slope.floors,
        hostKind: evidence.host.hostKind,
        hypervisor: evidence.host.hypervisor,
        piHardware: evidence.contract.piHardware,
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

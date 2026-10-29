/**
 * 3-rep harness: each ClawQL rep is a fresh Node process (avoids RSS baseline pollution).
 * Infinity slope CSV (multi-rep) is merged once.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { infinityCsvToSlopeSampleEffect } from "../../../packages/clawql-api/src/program/density/infinity-harness-v2.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const reps = Math.max(1, Number(process.env.CLAWQL_HARNESS_REPS || 3));
const ns = process.env.CLAWQL_HARNESS_NS || "1000,5000,10000";
const infinityCsv =
  process.env.CLAWQL_HARNESS_INFINITY_CSV ||
  join(repoRoot, "docs/benchmarks/program-density/infinity-on-pi/infinity-slope-reps.csv");
const outPath =
  process.env.CLAWQL_HARNESS_OUT ||
  join(repoRoot, "docs/benchmarks/program-density/infinity-on-pi/evidence-harness-v2.json");
const cli = join(repoRoot, "packages/clawql-api/src/program/density/infinity-harness-v2-cli.ts");

const infinitySamples = [];
if (infinityCsv) {
  const csv = readFileSync(infinityCsv, "utf8");
  const chunks = csv.split(/^---rep=(\d+)---$/m);
  if (chunks.length === 1) {
    infinitySamples.push(await Effect.runPromise(infinityCsvToSlopeSampleEffect(csv, 1)));
  } else {
    for (let i = 1; i < chunks.length; i += 2) {
      infinitySamples.push(
        await Effect.runPromise(
          infinityCsvToSlopeSampleEffect(chunks[i + 1] ?? "", Number(chunks[i]))
        )
      );
    }
  }
}

const clawqlSamples = [];
for (let rep = 1; rep <= reps; rep++) {
  const tmp = `/tmp/clawql-harness-v2-rep${rep}.json`;
  const env = {
    ...process.env,
    CLAWQL_HARNESS_REPS: "1",
    CLAWQL_HARNESS_NS: ns,
    CLAWQL_HARNESS_OUT: tmp,
    // Infinity already collected; skip re-merge inside child
    CLAWQL_HARNESS_INFINITY_CSV: "",
  };
  delete env.CLAWQL_HARNESS_INFINITY_CSV;
  console.error(`harness rep ${rep}/${reps} (fresh process)`);
  const r = spawnSync(process.execPath, ["--expose-gc", "--import", "tsx", cli, tmp], {
    env,
    encoding: "utf8",
    cwd: repoRoot,
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(`rep ${rep} failed: ${r.status}`);
  }
  const evidence = JSON.parse(readFileSync(tmp, "utf8"));
  for (const s of evidence.slope.samples) {
    if (s.system === "infinity") continue;
    clawqlSamples.push({ ...s, rep });
  }
}

// Rebuild combined evidence from last child + merged samples
const lastTmp = `/tmp/clawql-harness-v2-rep${reps}.json`;
const base = JSON.parse(readFileSync(lastTmp, "utf8"));
const samples = [...infinitySamples, ...clawqlSamples];
const floor = (sys) => {
  const xs = samples
    .filter((s) => s.system === sys)
    .map((s) => s.slopeKiBPerAgent)
    .filter((n) => typeof n === "number" && Number.isFinite(n));
  return xs.length ? Math.min(...xs) : null;
};

const combined = {
  ...base,
  measuredAt: new Date().toISOString(),
  publishable: false,
  contract: { ...base.contract, reps },
  slope: {
    ...base.slope,
    samples,
    floors: {
      infinitySlopeKiBPerAgent: floor("infinity"),
      clawqlResidentSlopeKiBPerAgent: floor("clawql-resident"),
      clawqlOffloadedSlopeKiBPerAgent: floor("clawql-offloaded"),
    },
    reading:
      "3-rep floor of slopes (fresh Node process per ClawQL rep). " +
      "Compare Infinity vs clawql-resident. Offloaded is a different trade-off. publishable:false.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(combined, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outPath,
      publishable: false,
      floors: combined.slope.floors,
      byteParity: {
        infinityBytes: combined.byteParity.infinity.serdeJsonMsgsBytes,
        clawqlMatchedBytes: combined.byteParity.clawqlMatched.serializedJsonBytes,
      },
      reps,
    },
    null,
    2
  )
);

/**
 * Focused sustained-rate ramp that continues to the first miss.
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-ramp-past-failure.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  openTriggerJournalEffect,
  rampSustainableRateEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const outPath =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  "/opt/cursor/artifacts/deadline-ramp-past-failure.json";

const residentHeapSize = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-bags-fair";
const rates = (
  process.env.CLAWQL_DENSITY_RAMP_RATES ||
  "64000,128000,192000,256000,384000,512000,768000"
)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const flushPolicy = {
  mode: "group_commit",
  batchMax: Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64),
  flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
};

mkdirSync(join(journalDir, ".ramp"), { recursive: true });
const journal = await Effect.runPromise(
  openTriggerJournalEffect(join(journalDir, ".ramp"), flushPolicy)
);

const result = await Effect.runPromise(
  Effect.gen(function* () {
    try {
      return yield* rampSustainableRateEffect({
        agentIds: Array.from({ length: 1_000 }, (_, i) => `ramp_${i}`),
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        windowMs: 1_000,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        ratesPerSec: rates,
        residentHeapSize,
        scheduleShape: "typed_arrays",
        percentile: (samples, p) => Effect.runSync(percentileMsEffect(samples, p)),
      });
    } finally {
      yield* Effect.promise(() => journal.close());
    }
  })
);

const payload = {
  measuredAt: new Date().toISOString(),
  flushPolicy,
  scheduleShape: "typed_arrays",
  residentHeapSize,
  ...result,
  reading: {
    note: "group_commit sustained rate is largely disk-fsync bound (≤ batchMax × fsyncs/sec). Cross-host gaps are not a language verdict.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      sustainablePerSec: result.sustainablePerSec,
      firstRateMissingSlaPerSec: result.firstRateMissingSlaPerSec,
      rampWentPastFailure: result.rampWentPastFailure,
    },
    null,
    2
  )
);

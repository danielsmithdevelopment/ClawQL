/**
 * Focused deadline throughput measure at a claimed resident heap size,
 * under an explicit flush policy. Writes JSON to --out= path.
 *
 *   CLAWQL_DENSITY_FLUSH_MODE=group_commit|fsync_each|os_buffer \
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-deadline-throughput.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  DEFAULT_TRIGGER_FLUSH_POLICY,
  openTriggerJournalEffect,
  runDeadlineAccuracyEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { runTriggerJournalCrashTestEffect } from "../../../packages/clawql-api/src/program/density/trigger-journal-crash.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const outPath =
  outArg ||
  join(repoRoot, "docs/benchmarks/program-density/deadline-throughput-latest.json");

const residentHeapSize = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const maxFires = Number(process.env.CLAWQL_DENSITY_DEADLINE_MAX_FIRES || 2_000);
const horizonMs = Number(process.env.CLAWQL_DENSITY_DEADLINE_HORIZON_MS || 3_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-bags-fair";
const skipCrash = process.env.CLAWQL_DENSITY_SKIP_DEADLINE_CRASH === "1";

const flushMode = process.env.CLAWQL_DENSITY_FLUSH_MODE || "group_commit";
const flushPolicy =
  flushMode === "os_buffer"
    ? { mode: "os_buffer" }
    : flushMode === "fsync_each"
      ? { mode: "fsync_each" }
      : {
          mode: "group_commit",
          batchMax: Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64),
          flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
        };

const sampleIds = Array.from(
  { length: maxFires },
  (_, i) => `bag_${i.toString(16).padStart(8, "0")}_throughput`
);

const payload = await Effect.runPromise(
  Effect.gen(function* () {
    const crashTest = skipCrash
      ? null
      : yield* runTriggerJournalCrashTestEffect({
          workDir: join(journalDir, ".deadline-crash"),
          policy: flushPolicy,
          total: 2_000,
          concurrency: Math.min(32, concurrency),
          killAfterAcks: 400,
        });

    const journal = yield* openTriggerJournalEffect(journalDir, flushPolicy);
    try {
      const report = yield* runDeadlineAccuracyEffect({
        agentIds: sampleIds,
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        horizonMs,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        firedDefinition: "durable_trigger_record",
        flushPolicy,
        residentHeapSize,
        rampWindowMs: 1_000,
        rampRatesPerSec: [50, 100, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000],
        crashTest,
        percentile: (samples, p) => Effect.runSync(percentileMsEffect(samples, p)),
      });
      return { report, crashTest, flushPolicy, journalPath: journal.path };
    } finally {
      yield* Effect.promise(() => journal.close());
    }
  })
);

const out = {
  measuredAt: new Date().toISOString(),
  residentHeapSize,
  maxFires,
  horizonMs,
  concurrency,
  firedDefinition: "durable_trigger_record",
  flushPolicy: payload.flushPolicy,
  flushPolicyDefault: DEFAULT_TRIGGER_FLUSH_POLICY,
  crashTest: payload.crashTest,
  report: payload.report,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(
  JSON.stringify(
    {
      outPath,
      residentHeapSize,
      flushPolicy: payload.flushPolicy,
      crashTestOk: payload.crashTest?.ok ?? null,
      sustainablePerSec: payload.report.sustainablePerSec,
      steady: {
        arrivalRatePerSec: payload.report.steady.arrivalRatePerSec,
        pctWithinSla: payload.report.steady.pctWithinSla,
        excessP99: payload.report.steady.excessOverTickP99Ms,
        wallMs: payload.report.steady.wallMs,
      },
      burst: {
        drainPerSec: payload.report.burst.arrivalRatePerSec,
        pctWithinSla: payload.report.burst.pctWithinSla,
        excessP99: payload.report.burst.excessOverTickP99Ms,
        wallMs: payload.report.burst.wallMs,
      },
      ramp: payload.report.ramp.map((a) => ({
        arrivalRatePerSec: a.arrivalRatePerSec,
        pctWithinSla: a.pctWithinSla,
        excessP99: a.excessOverTickP99Ms,
      })),
      scheduler: payload.report.scheduler,
    },
    null,
    2
  ) + "\n"
);

/**
 * A/B: object_entries vs typed_arrays schedule under a 2.5e6 resident pad,
 * with GC tracing on the steady arm (group_commit flush).
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-gc-schedule-ab.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import {
  openTriggerJournalEffect,
  runDeadlineAccuracyEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const out =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  "/opt/cursor/artifacts/deadline-gc-schedule-ab.json";

const residentHeapSize = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const maxFires = Number(process.env.CLAWQL_DENSITY_DEADLINE_MAX_FIRES || 2_000);
const horizonMs = Number(process.env.CLAWQL_DENSITY_DEADLINE_HORIZON_MS || 3_000);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-bags-fair";

const sampleIds = Array.from(
  { length: maxFires },
  (_, i) => `bag_${i.toString(16).padStart(8, "0")}_gcab`
);

const flushPolicy = {
  mode: "group_commit",
  batchMax: 64,
  flushIntervalMs: 10,
};

async function runShape(scheduleShape) {
  global.gc?.();
  const journal = await Effect.runPromise(openTriggerJournalEffect(journalDir, flushPolicy));
  try {
    const report = await Effect.runPromise(
      runDeadlineAccuracyEffect({
        agentIds: sampleIds,
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        horizonMs,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency: 64,
        firedDefinition: "durable_trigger_record",
        flushPolicy,
        residentHeapSize,
        scheduleShape,
        skipRamp: true,
        percentile: (samples, p) => Effect.runSync(percentileMsEffect(samples, p)),
      })
    );
    return {
      scheduleShape,
      steady: {
        arrivalRatePerSec: report.steady.arrivalRatePerSec,
        pctWithinSla: report.steady.pctWithinSla,
        latenessP50Ms: report.steady.latenessP50Ms,
        latenessP99Ms: report.steady.latenessP99Ms,
        excessP99Ms: report.steady.excessOverTickP99Ms,
        wallMs: report.steady.wallMs,
        gcTrace: report.steady.gcTrace,
      },
      burst: {
        drainPerSec: report.burst.arrivalRatePerSec,
        pctWithinSla: report.burst.pctWithinSla,
        excessP99Ms: report.burst.excessOverTickP99Ms,
        wallMs: report.burst.wallMs,
        gcTrace: report.burst.gcTrace,
      },
    };
  } finally {
    await journal.close();
  }
}

const objectArm = await runShape("object_entries");
const typedArm = await runShape("typed_arrays");

const payload = {
  measuredAt: new Date().toISOString(),
  residentHeapSize,
  maxFires,
  horizonMs,
  flushPolicy,
  object_entries: objectArm,
  typed_arrays: typedArm,
  reading: {
    objectLateOverlap: objectArm.steady.gcTrace?.lateOverlapFraction ?? null,
    typedLateOverlap: typedArm.steady.gcTrace?.lateOverlapFraction ?? null,
    objectExcessP99: objectArm.steady.excessP99Ms,
    typedExcessP99: typedArm.steady.excessP99Ms,
    objectMajorMaxMs: objectArm.steady.gcTrace?.majorPauseMaxMs ?? null,
    typedMajorMaxMs: typedArm.steady.gcTrace?.majorPauseMaxMs ?? null,
    note:
      (objectArm.steady.gcTrace?.lateOverlapFraction ?? 0) >= 0.5 &&
      typedArm.steady.excessP99Ms < objectArm.steady.excessP99Ms * 0.5
        ? "GC pauses align with late fires on object_entries; typed_arrays collapses the tail — report as a TS runtime cost with typed best-effort."
        : (objectArm.steady.gcTrace?.lateOverlapFraction ?? 0) >= 0.5
          ? "Late fires overlap GC on object_entries; compare typed_arrays excess before claiming a full fix."
          : "Late fires do not strongly overlap GC under this threshold — inspect timer/event-loop as well.",
  },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

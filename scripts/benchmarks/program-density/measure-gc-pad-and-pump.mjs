/**
 * GC-trace covering pad construction + steady pump for object vs typed schedules.
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-gc-pad-and-pump.mjs
 */
import { writeFileSync } from "node:fs";
import { PerformanceObserver, performance } from "node:perf_hooks";
import { Effect } from "effect";
import {
  makeDeadlineScheduleEffect,
  makeTypedDeadlineScheduleEffect,
  openTriggerJournalEffect,
  padResidentHeap,
  runDeadlinePumpEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const out =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  "/opt/cursor/artifacts/deadline-gc-pad-and-pump.json";

function observeGc() {
  const pauses = [];
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.entryType !== "gc") continue;
      const kind = e.detail?.kind ?? 0;
      pauses.push({
        start: e.startTime,
        dur: e.duration,
        kind,
        major: kind === 2 || e.duration >= 50,
      });
    }
  });
  try {
    obs.observe({ entryTypes: ["gc"], buffered: true });
  } catch (err) {
    console.error("gc observe failed", err);
  }
  return {
    pauses,
    disconnect: () => {
      try {
        obs.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

async function arm(shape) {
  const gc = observeGc();
  const tPad0 = performance.now();
  const flushPolicy = { mode: "group_commit", batchMax: 64, flushIntervalMs: 10 };
  const journal = await Effect.runPromise(
    openTriggerJournalEffect("/tmp/clawql-density-bags-fair", flushPolicy)
  );
  const ids = Array.from({ length: 2000 }, (_, i) => `id_${i}`);
  const schedule =
    shape === "typed_arrays"
      ? await Effect.runPromise(makeTypedDeadlineScheduleEffect(2_510_000))
      : await Effect.runPromise(makeDeadlineScheduleEffect());
  const now = Date.now();
  const horizon = 3000;
  for (let i = 0; i < 2000; i++) {
    schedule.schedule(ids[i], now + Math.floor(((i + 0.5) * horizon) / 2000));
  }
  padResidentHeap(schedule, 2_500_000, now + horizon + 3_600_000);
  global.gc?.();
  const tPad1 = performance.now();
  const pausesAfterPad = [...gc.pauses];

  const result = await Effect.runPromise(
    runDeadlinePumpEffect({
      schedule,
      fire: async (e) => {
        await journal.record(e.agentId, e.deadlineMs);
      },
      maxFires: 2000,
      wallDeadlineMs: now + horizon + 5000,
      tickMs: 1,
      slaMs: 1000,
      concurrency: 64,
      mode: "steady",
      arrivalRatePerSec: 2000 / 3,
      traceGc: true,
      lateGcThresholdMs: 50,
      percentile: (s, p) => Effect.runSync(percentileMsEffect(s, p)),
    })
  );
  await journal.close();
  gc.disconnect();

  return {
    shape,
    padMs: Number((tPad1 - tPad0).toFixed(1)),
    pausesAfterPad: pausesAfterPad.length,
    maxPauseAfterPadMs: pausesAfterPad.reduce((m, p) => Math.max(m, p.dur), 0),
    totalPauses: gc.pauses.length,
    majorPauses: gc.pauses.filter((p) => p.major).length,
    maxPauseMs: gc.pauses.reduce((m, p) => Math.max(m, p.dur), 0),
    topPauses: [...gc.pauses]
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 8)
      .map((p) => ({ dur: Number(p.dur.toFixed(2)), kind: p.kind, major: p.major })),
    steady: {
      excessP99: result.excessOverTickP99Ms,
      latenessP50: result.latenessP50Ms,
      latenessP99: result.latenessP99Ms,
      gcTrace: result.gcTrace,
      wallMs: result.wallMs,
    },
  };
}

const objectArm = await arm("object_entries");
const typedArm = await arm("typed_arrays");
const payload = {
  measuredAt: new Date().toISOString(),
  object_entries: objectArm,
  typed_arrays: typedArm,
  reading: {
    objectExcessP99: objectArm.steady.excessP99,
    typedExcessP99: typedArm.steady.excessP99,
    objectMaxGcMs: objectArm.maxPauseMs,
    typedMaxGcMs: typedArm.maxPauseMs,
    objectPumpLateOverlap: objectArm.steady.gcTrace?.lateOverlapFraction ?? null,
    typedPumpLateOverlap: typedArm.steady.gcTrace?.lateOverlapFraction ?? null,
    note:
      objectArm.maxPauseMs >= 50 && objectArm.steady.excessP99 > typedArm.steady.excessP99 * 2
        ? "Large GC pauses appear while building/holding the object schedule; typed_arrays cuts steady excess p99 sharply. Fair column: report both shapes; board default typed_arrays."
        : "Typed_arrays still improves the tail; GC observer evidence is mixed — publish both numbers.",
  },
};

writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

/**
 * Separate durable drain throughput from 1s-SLA sustained rate, and split
 * lateness at the cliff into wait-to-pop / wait-for-batch / wait-for-sync.
 *
 * Hypothesis after metadata arms: cycle time ≫ sync latency ⇒ time between
 * syncs (write, libuv handoff, ack, event-loop) OR the ramp is a latency
 * limit (nothing asks the writer to go faster).
 *
 *   npm run benchmark:program-density-drain-vs-sustained
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Effect } from "effect";
import {
  makeTypedDeadlineScheduleEffect,
  openTriggerJournalEffect,
  padResidentHeap,
  rampSustainableRateEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outPath =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  join(repoRoot, "docs/benchmarks/program-density/drain-vs-sustained.json");
const workDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-drain-vs-sustained";
const ceilingPath =
  process.env.CLAWQL_DENSITY_FSYNC_CEILING_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");
const metaArmsPath =
  process.env.CLAWQL_DENSITY_FSYNC_META_ARMS_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-metadata-arms.json");
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 128);
const drainN = Number(process.env.CLAWQL_DENSITY_DRAIN_N || 64_000);
const residentHeap = Number(process.env.CLAWQL_DENSITY_PROFILE_HEAP || 250_000);
const cliffRates = (process.env.CLAWQL_DENSITY_CLIFF_RATES || "128000,192000,256000,384000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
/** Board/campaign default 30s; shorter only for smoke (still must catch growing backlog). */
const rampStepMs = Number(
  process.env.CLAWQL_DENSITY_RAMP_STEP_MS || 30_000
);

mkdirSync(workDir, { recursive: true });
const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

const ceiling = existsSync(ceilingPath)
  ? JSON.parse(readFileSync(ceilingPath, "utf8"))
  : null;
const metaArms = existsSync(metaArmsPath)
  ? JSON.parse(readFileSync(metaArmsPath, "utf8"))
  : null;
const serialFsyncs = ceiling?.serial?.fsyncsPerSec ?? null;
const probeSyncP50 = ceiling?.serial?.fsyncLatencyMs?.p50Ms ?? null;

/** Best journal config on this host (disclose; Ontologiql may differ). */
function pickBestJournalPolicy() {
  const arms = metaArms?.compare ?? metaArms?.arms ?? [];
  let best = null;
  for (const a of arms) {
    const rate = a.sustainedRecordsPerSec ?? a.sustainedOverBaseline;
    if (rate == null) continue;
    const label = a.label;
    if (!best || (a.sustainedRecordsPerSec ?? 0) > (best.sustainedRecordsPerSec ?? 0)) {
      best = a;
    }
    void label;
  }
  // ClawQL cloud host: arms were within ~3% — keep board default fsync append.
  // Prefer prealloc only if it lifted ≥15% (Ontologiql-class win).
  const baseline = arms.find((a) => a.label === "fsync_append");
  const prealloc = arms.find((a) => a.label === "fdatasync_prealloc");
  if (
    baseline?.sustainedRecordsPerSec &&
    prealloc?.sustainedRecordsPerSec &&
    prealloc.sustainedRecordsPerSec >= baseline.sustainedRecordsPerSec * 1.15
  ) {
    return {
      mode: "group_commit",
      batchMax,
      flushIntervalMs: 10,
      dataSync: "fdatasync",
      preallocateBytes: Number(process.env.CLAWQL_DENSITY_PREALLOC_BYTES || 256 * 1024 * 1024),
      chosenBecause: "prealloc_lift_ge_15pct_vs_fsync_append",
      disclosedFrom: "fsync-metadata-arms.json",
    };
  }
  return {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
    dataSync: "fsync",
    preallocateBytes: null,
    chosenBecause: "board_default_fsync_append_metadata_arms_neutral_on_this_host",
    disclosedFrom: metaArms ? "fsync-metadata-arms.json" : null,
    bestArmLabel: best?.label ?? "fsync_append",
  };
}

const journalPolicy = pickBestJournalPolicy();

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function openJournal(subdir) {
  const dir = join(workDir, subdir);
  mkdirSync(dir, { recursive: true });
  return Effect.runPromise(
    openTriggerJournalEffect(dir, {
      mode: "group_commit",
      batchMax: journalPolicy.batchMax,
      flushIntervalMs: journalPolicy.flushIntervalMs,
      dataSync: journalPolicy.dataSync,
      ...(journalPolicy.preallocateBytes
        ? { preallocateBytes: journalPolicy.preallocateBytes }
        : {}),
    })
  );
}

/**
 * Saturating continuous drain (same path as the ramp): offer arrivals far
 * above capacity for `drainWindowMs` and read durable records/sec from flushStats.
 * Prefers this over "all already due" bursts, which understate continuous capacity.
 */
async function measurePureDrain() {
  const { runSteadyArrivalPumpEffect } = await import(
    "../../../packages/clawql-api/src/program/density/deadline-schedule.ts"
  );
  const journal = await openJournal("drain");
  const drainWindowMs = Number(process.env.CLAWQL_DENSITY_DRAIN_WINDOW_MS || Math.min(rampStepMs, 8_000));
  try {
    const sampleIds = Array.from({ length: 4_000 }, (_, i) => `bag_${i}`);
    journal.resetFlushStats();
    const t0 = performance.now();
    const saturateRate = Number(
      process.env.CLAWQL_DENSITY_DRAIN_SATURATE_RATE ||
        Math.max(512_000, (serialFsyncs ?? 8_000) * batchMax)
    );
    const arm = await Effect.runPromise(
      runSteadyArrivalPumpEffect({
        agentIds: sampleIds,
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        // Above capacity; keep a small pending cap so GC doesn't thrash the writer.
        arrivalRatePerSec: saturateRate,
        stepDurationMs: drainWindowMs,
        slaMs: 1_000,
        slaTargetPct: 0, // ignore SLA; we want throughput only
        concurrency,
        requireNonGrowingBacklog: false,
        allowBacklogEarlyStop: false,
        maxPending: Math.max(concurrency * 64, 8_192),
        percentile: pct,
      })
    );
    await journal.flush();
    const wallMs = performance.now() - t0;
    const flushStats = journal.snapshotFlushStats();
    const fromFlush = flushStats.recordsPerSec;
    const fromFired = arm.fired > 0 && wallMs > 0 ? (arm.fired * 1000) / wallMs : 0;
    // Prefer journal flush accounting over wall/fired (early-stop shortens wall oddly).
    const durableRecordsPerSec = Number((fromFlush > 0 ? fromFlush : fromFired).toFixed(2));
    return {
      mode: "saturating_continuous",
      n: arm.fired,
      wallMs: Number(wallMs.toFixed(2)),
      drainWindowMs,
      durableRecordsPerSec,
      fsyncsPerSec: flushStats.fsyncsPerSec,
      avgBatchSize: flushStats.avgBatchSize,
      cycleStagesMs: flushStats.cycleStagesMs,
      fsyncLatencyMs: flushStats.fsyncLatencyMs,
      doubleBufferHits: flushStats.doubleBufferHits,
      backlogTrend: arm.backlogTrend,
      cycleMsImplied: flushStats.cycleStagesMs?.cycleMeanMs
        ? Number((1000 / flushStats.cycleStagesMs.cycleMeanMs).toFixed(1))
        : null,
      gapPlusCycleMs:
        flushStats.cycleStagesMs?.cycleMeanMs != null &&
        flushStats.cycleStagesMs?.interFlushGapMeanMs != null
          ? Number(
              (
                flushStats.cycleStagesMs.cycleMeanMs +
                flushStats.cycleStagesMs.interFlushGapMeanMs
              ).toFixed(4)
            )
          : null,
    };
  } finally {
    await journal.close();
  }
}

/** Sustained rate within 1s SLA — continuous arrivals until steady state. */
async function measureSustained() {
  const journal = await openJournal("sustained");
  try {
    const sampleIds = Array.from({ length: 4_000 }, (_, i) => `bag_${i}`);
    journal.resetFlushStats();
    const ramp = await Effect.runPromise(
      rampSustainableRateEffect({
        agentIds: sampleIds,
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        windowMs: rampStepMs,
        minStepDurationMs: rampStepMs,
        requireNonGrowingBacklog: true,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        ratesPerSec: cliffRates,
        refineRelative: 0.05,
        residentHeapSize: 50_000,
        scheduleShape: "typed_arrays",
        percentile: pct,
      })
    );
    const flushStats = journal.snapshotFlushStats();
    return {
      sustainablePerSec: ramp.sustainablePerSec,
      firstRateMissingSlaPerSec: ramp.firstRateMissingSlaPerSec,
      rampResolutionRel: ramp.rampResolutionRel,
      rampResolutionNote: ramp.rampResolutionNote,
      rampMethodology: ramp.rampMethodology,
      rampArms: ramp.ramp.map((a) => ({
        arrivalRatePerSec: a.arrivalRatePerSec,
        pctWithinSla: a.pctWithinSla,
        stepDurationMs: a.stepDurationMs ?? null,
        steadyStatePass: a.steadyStatePass ?? null,
        failReason: a.failReason ?? null,
        backlogTrend: a.backlogTrend
          ? {
              growing: a.backlogTrend.growing,
              startOverdue: a.backlogTrend.startOverdue,
              endOverdue: a.backlogTrend.endOverdue,
              finalStretchStartOverdue: a.backlogTrend.finalStretchStartOverdue,
              finalStretchEndOverdue: a.backlogTrend.finalStretchEndOverdue,
              slopePerSec: a.backlogTrend.slopePerSec,
              earlyStopBacklogExceeded: a.backlogTrend.earlyStopBacklogExceeded,
            }
          : null,
        latenessP99Ms: a.latenessP99Ms,
        wallMs: a.wallMs,
      })),
      flushStatsAcrossRamp: {
        fsyncsPerSec: flushStats.fsyncsPerSec,
        recordsPerSec: flushStats.recordsPerSec,
        avgBatchSize: flushStats.avgBatchSize,
        cycleStagesMs: flushStats.cycleStagesMs,
        fsyncLatencyMs: flushStats.fsyncLatencyMs,
      },
    };
  } finally {
    await journal.close();
  }
}

/**
 * At a chosen offered rate, sample late fires and split lateness into
 * waitToPop / waitForBatch / waitForSync(+write).
 */
async function measureLatenessSplit(offeredRatePerSec) {
  const journal = await openJournal(`cliff-${offeredRatePerSec}`);
  try {
    const windowMs = 1_000;
    const n = Math.max(batchMax * 4, Math.floor((offeredRatePerSec * windowMs) / 1000));
    const schedule = await Effect.runPromise(
      makeTypedDeadlineScheduleEffect(Math.max(n, 50_000) + 10_000)
    );
    const now = Date.now();
    const ids = Array.from({ length: Math.min(n, 8_000) }, (_, i) => `bag_${i}`);
    for (let i = 0; i < n; i++) {
      const deadlineMs = now + Math.floor(((i + 0.5) * windowMs) / n);
      schedule.schedule(ids[i % ids.length], deadlineMs);
    }
    padResidentHeap(schedule, 50_000, now + windowMs + 3_600_000);

    const waitToPop = [];
    const waitForBatch = [];
    const waitForWrite = [];
    const waitForSync = [];
    const waitForDurable = [];
    const lateness = [];
    const lateSplits = [];

    journal.resetFlushStats();
    const wallEnd = now + windowMs + 2_000;
    let fired = 0;
    while (fired < n && Date.now() < wallEnd) {
      const next = schedule.peekDeadlineMs();
      if (next === null) break;
      const t = Date.now();
      if (next > t) {
        await new Promise((r) => setTimeout(r, Math.min(5, next - t)));
        continue;
      }
      const due = schedule.popDue(Date.now());
      if (due.length === 0) {
        await new Promise((r) => setImmediate(r));
        continue;
      }
      const poppedAt = Date.now();
      const batch = due.slice(0, n - fired);
      await mapPool(batch, concurrency, async (entry) => {
        const waitPopMs = Math.max(0, poppedAt - entry.deadlineMs);
        const trace = await journal.recordTraced(entry.agentId, entry.deadlineMs);
        const lateMs = Math.max(0, trace.firedAt - entry.deadlineMs);
        waitToPop.push(waitPopMs);
        waitForBatch.push(trace.waitForBatchMs);
        waitForWrite.push(trace.writeMs);
        waitForSync.push(trace.syncMs);
        waitForDurable.push(trace.waitForDurableMs);
        lateness.push(lateMs);
        if (lateMs >= 1_000) {
          lateSplits.push({
            latenessMs: lateMs,
            waitToPopMs: waitPopMs,
            waitForBatchMs: trace.waitForBatchMs,
            writeMs: trace.writeMs,
            syncMs: trace.syncMs,
            waitForDurableMs: trace.waitForDurableMs,
            // Remainder after accounting for pop wait + durable wait (may overlap batch peers).
            residualMs: Math.max(0, lateMs - waitPopMs - trace.waitForDurableMs),
          });
        }
      });
      fired += batch.length;
    }
    await journal.flush();
    const flushStats = journal.snapshotFlushStats();
    const withinSla = lateness.filter((x) => x <= 1_000).length;
    const pctWithinSla = lateness.length
      ? Number(((100 * withinSla) / lateness.length).toFixed(2))
      : 0;

    const summarize = (xs) =>
      xs.length === 0
        ? { n: 0, mean: null, p50: null, p99: null }
        : {
            n: xs.length,
            mean: Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)),
            p50: Number(pct(xs, 50).toFixed(3)),
            p99: Number(pct(xs, 99).toFixed(3)),
          };

    return {
      offeredRatePerSec,
      fired,
      pctWithinSla,
      metSla: pctWithinSla >= 99,
      latenessMs: summarize(lateness),
      stagesAllFires: {
        waitToPopMs: summarize(waitToPop),
        waitForBatchMs: summarize(waitForBatch),
        writeMs: summarize(waitForWrite),
        syncMs: summarize(waitForSync),
        waitForDurableMs: summarize(waitForDurable),
      },
      lateOnly: {
        count: lateSplits.length,
        meanWaitToPopMs:
          lateSplits.length === 0
            ? null
            : Number(
                (
                  lateSplits.reduce((a, b) => a + b.waitToPopMs, 0) / lateSplits.length
                ).toFixed(3)
              ),
        meanWaitForBatchMs:
          lateSplits.length === 0
            ? null
            : Number(
                (
                  lateSplits.reduce((a, b) => a + b.waitForBatchMs, 0) / lateSplits.length
                ).toFixed(3)
              ),
        meanSyncMs:
          lateSplits.length === 0
            ? null
            : Number(
                (lateSplits.reduce((a, b) => a + b.syncMs, 0) / lateSplits.length).toFixed(3)
              ),
        meanWaitForDurableMs:
          lateSplits.length === 0
            ? null
            : Number(
                (
                  lateSplits.reduce((a, b) => a + b.waitForDurableMs, 0) / lateSplits.length
                ).toFixed(3)
              ),
        sample: lateSplits.slice(0, 8),
      },
      flushStats: {
        fsyncsPerSec: flushStats.fsyncsPerSec,
        recordsPerSec: flushStats.recordsPerSec,
        cycleStagesMs: flushStats.cycleStagesMs,
        fsyncLatencyMs: flushStats.fsyncLatencyMs,
      },
    };
  } finally {
    await journal.close();
  }
}

const pureDrain = await measurePureDrain();
const sustained = await measureSustained();
const skipCliffLateness = process.env.CLAWQL_DENSITY_SKIP_CLIFF_LATENESS === "1";
const cliffRate =
  sustained.firstRateMissingSlaPerSec ??
  Math.max(sustained.sustainablePerSec * 1.25, sustained.sustainablePerSec + 32_000);
const cliff = skipCliffLateness
  ? {
      offeredRatePerSec: cliffRate,
      fired: 0,
      pctWithinSla: null,
      metSla: null,
      latenessMs: { n: 0, mean: null, p50: null, p99: null },
      stagesAllFires: null,
      lateOnly: { count: 0, meanWaitToPopMs: null, meanWaitForBatchMs: null, meanSyncMs: null, meanWaitForDurableMs: null, sample: [] },
      flushStats: null,
      skipped: true,
      note: "Set CLAWQL_DENSITY_SKIP_CLIFF_LATENESS=0 to sample waitToPop/batch/sync at the cliff.",
    }
  : await measureLatenessSplit(cliffRate);
const atSustainable = skipCliffLateness
  ? null
  : await measureLatenessSplit(sustained.sustainablePerSec || 256_000);

const cycleMs = pureDrain.cycleStagesMs?.cycleMeanMs;
const gapMs = pureDrain.cycleStagesMs?.interFlushGapMeanMs;
const syncMs = pureDrain.cycleStagesMs?.syncMeanMs;
const observedFsyncPeriodMs =
  pureDrain.fsyncsPerSec > 0 ? Number((1000 / pureDrain.fsyncsPerSec).toFixed(3)) : null;

let diagnosis;
const sustainedRate = sustained.sustainablePerSec || 0;
const drainRate = pureDrain.durableRecordsPerSec;
// Allow ~15% host/measurement noise between saturating-drain and ramp windows.
const sustainedAboveDrain = sustainedRate > drainRate * 1.15;
if (sustainedAboveDrain) {
  diagnosis = "inconsistent_sustained_above_drain_ramp_still_too_short";
} else if (sustainedRate > 0 && drainRate > sustainedRate * 1.25) {
  diagnosis = "latency_limit_drain_exceeds_sustained_sla_rate";
} else if (sustainedRate > 0 && drainRate >= sustainedRate * 0.85) {
  diagnosis = "writer_bound_sustained_near_drain";
} else if (syncMs != null && observedFsyncPeriodMs != null && observedFsyncPeriodMs > syncMs * 1.8) {
  diagnosis = "cycle_time_dominated_by_non_sync_stages";
} else {
  diagnosis = "durable_path_mixed_drain_and_cycle";
}

const payload = {
  kind: "durable-agent-density-drain-vs-sustained",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  journalConfig: journalPolicy,
  serialCeiling: {
    fsyncsPerSec: serialFsyncs,
    probeSyncP50Ms: probeSyncP50,
    theoreticalMaxGroupCommitPerSec: serialFsyncs != null ? serialFsyncs * batchMax : null,
  },
  pureDrain,
  sustainedWithinOneSecondSla: sustained,
  latenessAtSustainable: atSustainable,
  latenessAtCliff: cliff,
  compare: {
    durableRecordsPerSec: pureDrain.durableRecordsPerSec,
    rateSustainableWithinOneSecondSla: sustained.sustainablePerSec,
    drainOverSustained:
      sustained.sustainablePerSec > 0
        ? Number((pureDrain.durableRecordsPerSec / sustained.sustainablePerSec).toFixed(3))
        : null,
    sustainedAtOrBelowDrain: !sustainedAboveDrain,
    observedFsyncPeriodMs,
    syncMeanMs: syncMs,
    syncP50Ms: pureDrain.cycleStagesMs?.syncP50Ms ?? null,
    syncP99Ms: pureDrain.fsyncLatencyMs?.p99 ?? null,
    writeMeanMs: pureDrain.cycleStagesMs?.writeMeanMs ?? null,
    ackMeanMs: pureDrain.cycleStagesMs?.ackMeanMs ?? null,
    interFlushGapMeanMs: gapMs,
    cycleMeanMs: cycleMs,
    nonSyncShareOfPeriod:
      observedFsyncPeriodMs && syncMs != null
        ? Number((((observedFsyncPeriodMs - syncMs) / observedFsyncPeriodMs) * 100).toFixed(1))
        : null,
  },
  reading: {
    diagnosis,
    note:
      "Steady-state ramp: continuous arrivals for ≥30s/step (override CLAWQL_DENSITY_RAMP_STEP_MS); fail if overdue backlog grows. Sustained must be ≤ durable drain. If drain ≫ sustained → latency limit; if near drain → writer-bound. Record stepDurationMs + backlogTrend. Sync p99 beside mean (Ontologiql heavy tail). Prealloc: disclose best journal config per side.",
    boardColumns: {
      durableRecordsPerSec: pureDrain.durableRecordsPerSec,
      rateSustainableWithinOneSecondSla: sustained.sustainablePerSec,
    },
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      out: outPath,
      journalConfig: journalPolicy,
      durableRecordsPerSec: pureDrain.durableRecordsPerSec,
      rateSustainableWithinOneSecondSla: sustained.sustainablePerSec,
      drainOverSustained: payload.compare.drainOverSustained,
      sustainedAtOrBelowDrain: payload.compare.sustainedAtOrBelowDrain,
      rampMethodology: sustained.rampMethodology,
      rampArms: sustained.rampArms,
      cycleStagesMs: pureDrain.cycleStagesMs,
      syncP99Ms: pureDrain.fsyncLatencyMs?.p99 ?? null,
      observedFsyncPeriodMs,
      nonSyncShareOfPeriod: payload.compare.nonSyncShareOfPeriod,
      cliffPctWithinSla: cliff.pctWithinSla,
      cliffLateCount: cliff.lateOnly.count,
      cliffLateMeans: {
        waitToPop: cliff.lateOnly.meanWaitToPopMs,
        waitForBatch: cliff.lateOnly.meanWaitForBatchMs,
        sync: cliff.lateOnly.meanSyncMs,
        durable: cliff.lateOnly.meanWaitForDurableMs,
      },
      diagnosis,
    },
    null,
    2
  )
);

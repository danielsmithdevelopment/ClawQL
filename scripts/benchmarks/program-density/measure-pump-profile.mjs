/**
 * Profile the deadline pump producer path vs durable journal handoff.
 *
 * Hypothesis after double-buffer: fsyncs/sec barely moved (~3.2k→~3.3k) while
 * doubleBufferHits≈100% ⇒ limit is producing records (heap pop / encode /
 * handoff), not waiting on an empty writer.
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-pump-profile.mjs
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
  join(repoRoot, "docs/benchmarks/program-density/pump-profile.json");
const workDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-pump-profile";
const ceilingPath =
  process.env.CLAWQL_DENSITY_FSYNC_CEILING_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 128);
const residentHeap = Number(process.env.CLAWQL_DENSITY_PROFILE_HEAP || 250_000);
const drainN = Number(process.env.CLAWQL_DENSITY_PROFILE_N || 64_000);
const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

mkdirSync(workDir, { recursive: true });
for (const sub of ["durable", "ramp", "handoff"]) {
  mkdirSync(join(workDir, sub), { recursive: true });
}

const ceiling = existsSync(ceilingPath)
  ? JSON.parse(readFileSync(ceilingPath, "utf8"))
  : null;
const serialFsyncs = ceiling?.serial?.fsyncsPerSec ?? ceiling?.fsyncsPerSec ?? null;

function ns(t0) {
  return performance.now() - t0;
}

async function buildDueSchedule(n, heapSize) {
  const schedule = await Effect.runPromise(
    makeTypedDeadlineScheduleEffect(Math.max(n, heapSize) + 10_000)
  );
  const now = Date.now();
  const ids = Array.from({ length: n }, (_, i) => `bag_${i.toString(16).padStart(8, "0")}`);
  // All due immediately so the pump never sleeps on the producer path.
  for (let i = 0; i < n; i++) schedule.schedule(ids[i], now - 1);
  padResidentHeap(schedule, Math.max(n, heapSize), now + 3_600_000);
  return { schedule, ids, now };
}

/** Micro-bench: heap popDue cost alone. */
async function profilePopDue() {
  const { schedule } = await buildDueSchedule(drainN, residentHeap);
  const t0 = performance.now();
  let popped = 0;
  while (popped < drainN) {
    const due = schedule.popDue(Date.now() + 1);
    if (due.length === 0) break;
    popped += due.length;
  }
  const ms = ns(t0);
  return {
    n: popped,
    wallMs: Number(ms.toFixed(2)),
    perRecordUs: Number(((ms * 1000) / Math.max(1, popped)).toFixed(3)),
    recordsPerSec: Number(((popped * 1000) / ms).toFixed(2)),
  };
}

/** Micro-bench: JSON encode of a trigger line. */
function profileEncode() {
  const samples = [];
  const t0 = performance.now();
  for (let i = 0; i < drainN; i++) {
    const line = `${JSON.stringify({ agentId: `bag_${i}`, deadlineMs: 1_730_000_000_000 + i })}\n`;
    samples.push(line.length);
  }
  const ms = ns(t0);
  return {
    n: drainN,
    wallMs: Number(ms.toFixed(2)),
    perRecordUs: Number(((ms * 1000) / drainN).toFixed(3)),
    recordsPerSec: Number(((drainN * 1000) / ms).toFixed(2)),
    meanLineBytes: Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1)),
  };
}

/** Same bounded parallel map as the deadline pump. */
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

/**
 * Drain due deadlines through fire() like runDeadlinePumpEffect:
 * popDue all due, fire with concurrency pool (do not drop popped entries).
 *
 * Per-record awaitDurable is wall-clock under concurrency (overlaps) — use
 * sustainedRecordsPerSec + flushStats for the durable bound; use sequential
 * stageSample for non-overlapped encode/enqueue costs.
 */
async function profileDrain(label, fireFactory) {
  const { schedule } = await buildDueSchedule(drainN, residentHeap);
  const stages = {
    popMs: 0,
    fireMs: 0,
    encodeMs: 0,
    enqueueMs: 0,
    awaitDurableMs: 0,
  };
  let fired = 0;
  const t0 = performance.now();
  const fire = fireFactory(stages);

  while (fired < drainN) {
    const tp = performance.now();
    const due = schedule.popDue(Date.now() + 1);
    stages.popMs += performance.now() - tp;
    if (due.length === 0) break;
    const batch = due.slice(0, drainN - fired);
    const tf = performance.now();
    await mapPool(batch, concurrency, async (entry) => fire(entry));
    stages.fireMs += performance.now() - tf;
    fired += batch.length;
  }
  const wallMs = ns(t0);
  const flushStats =
    typeof fireFactory.journal?.snapshotFlushStats === "function"
      ? fireFactory.journal.snapshotFlushStats()
      : null;

  return {
    label,
    n: fired,
    wallMs: Number(wallMs.toFixed(2)),
    sustainedRecordsPerSec: Number(((fired * 1000) / wallMs).toFixed(2)),
    perRecordUs: {
      pop: Number(((stages.popMs * 1000) / Math.max(1, fired)).toFixed(3)),
      // fireTotal includes overlapped awaits — not additive CPU.
      fireWallOverlapped: Number(((stages.fireMs * 1000) / Math.max(1, fired)).toFixed(3)),
      encodeCpu: Number(((stages.encodeMs * 1000) / Math.max(1, fired)).toFixed(3)),
      enqueueSyncCpu: Number(((stages.enqueueMs * 1000) / Math.max(1, fired)).toFixed(3)),
      awaitDurableOverlapped: Number(((stages.awaitDurableMs * 1000) / Math.max(1, fired)).toFixed(3)),
      wall: Number(((wallMs * 1000) / Math.max(1, fired)).toFixed(3)),
    },
    flushStats,
  };
}

/** Sequential sample of encode + journal enqueue sync path (no await). */
async function profileSequentialHandoff(n = 10_000) {
  const journal = await Effect.runPromise(
    openTriggerJournalEffect(join(workDir, "handoff"), {
      mode: "group_commit",
      batchMax,
      flushIntervalMs: 10,
    })
  );
  const encodeMs = [];
  const enqueueMs = [];
  const pending = [];
  for (let i = 0; i < n; i++) {
    const entry = { agentId: `h_${i}`, deadlineMs: 1_730_000_000_000 + i };
    const te = performance.now();
    JSON.stringify({ agentId: entry.agentId, deadlineMs: entry.deadlineMs });
    encodeMs.push(performance.now() - te);
    const tq = performance.now();
    pending.push(journal.record(entry.agentId, entry.deadlineMs));
    enqueueMs.push(performance.now() - tq);
  }
  await Promise.all(pending);
  await journal.close();
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    n,
    encodePerRecordUs: Number((mean(encodeMs) * 1000).toFixed(3)),
    enqueueSyncPerRecordUs: Number((mean(enqueueMs) * 1000).toFixed(3)),
    note: "Sequential CPU-side cost before await-durable; journal.record still encodes internally so encode here is sibling cost.",
  };
}

// --- Arms ---
const popOnly = await profilePopDue();
const encodeOnly = profileEncode();

const noopFactory = (stages) => async () => {
  // Simulate encode cost without IO.
  const te = performance.now();
  JSON.stringify({ agentId: "x", deadlineMs: 1 });
  stages.encodeMs += performance.now() - te;
};

const noopDrain = await profileDrain("pop_encode_noop_fire", noopFactory);

const journal = await Effect.runPromise(
  openTriggerJournalEffect(join(workDir, "durable"), {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
  })
);
journal.resetFlushStats();
const durableFactory = (stages) => {
  const fn = async (entry) => {
    const te = performance.now();
    // Mirror journal.record's encode (record encodes internally; measure sibling cost).
    JSON.stringify({ agentId: entry.agentId, deadlineMs: entry.deadlineMs });
    stages.encodeMs += performance.now() - te;
    const tq = performance.now();
    const p = journal.record(entry.agentId, entry.deadlineMs);
    stages.enqueueMs += performance.now() - tq;
    const ta = performance.now();
    await p;
    stages.awaitDurableMs += performance.now() - ta;
  };
  return fn;
};
durableFactory.journal = journal;
const durableDrain = await profileDrain("pop_encode_durable_fire", durableFactory);
await journal.close();

const sequentialHandoff = await profileSequentialHandoff(10_000);

// Sustained rate via refined ramp (post–double-buffer headline).
const sampleIds = Array.from({ length: 4_000 }, (_, i) => `bag_${i}`);
const journal2 = await Effect.runPromise(
  openTriggerJournalEffect(join(workDir, "ramp"), {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
  })
);
journal2.resetFlushStats();
const ramp = await Effect.runPromise(
  rampSustainableRateEffect({
    agentIds: sampleIds,
    fire: async (entry) => {
      await journal2.record(entry.agentId, entry.deadlineMs);
    },
    windowMs: 1_000,
    slaMs: 1_000,
    slaTargetPct: 99,
    concurrency,
    ratesPerSec: [128_000, 192_000, 256_000, 320_000, 384_000, 448_000, 512_000],
    refineRelative: 0.01,
    residentHeapSize: residentHeap,
    scheduleShape: "typed_arrays",
    percentile: pct,
  })
);
const rampFlush = journal2.snapshotFlushStats();
await journal2.close();

const impliedProducerCap = durableDrain.sustainedRecordsPerSec;
const fractionOfSerial =
  serialFsyncs && rampFlush.fsyncsPerSec
    ? Number((rampFlush.fsyncsPerSec / serialFsyncs).toFixed(4))
    : null;

const reading = {
  diagnosis: "double_buffer_active_fsync_rate_unchanged_producer_bound_under_investigation",
  summary:
    "Double-buffer works (hits≈100%) but fsyncs/sec stayed ~3.2–3.3k (~40% of serial). Sustained durable drain ≈ producer path limit. Profile stages to see heap pop / encode / await-durable split. Ontologiql at ~24% of serial may be the same — profile before double-buffer there.",
  note:
    "Do not label as idle-writer-fixed. Relabel: double-buffer active; fsync rate unchanged; producer-bound under investigation.",
};

const payload = {
  kind: "durable-agent-density-pump-profile",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  host: {
    residentHeap,
    drainN,
    concurrency,
    batchMax,
    doubleBuffered: true,
  },
  serialCeiling: {
    fsyncsPerSec: serialFsyncs,
    theoreticalMaxGroupCommitPerSec: serialFsyncs != null ? serialFsyncs * batchMax : null,
  },
  micro: {
    popDue: popOnly,
    encode: encodeOnly,
    sequentialHandoff,
  },
  drains: {
    noopFire: noopDrain,
    durableFire: durableDrain,
  },
  postDoubleBufferRamp: {
    sustainablePerSec: ramp.sustainablePerSec,
    firstRateMissingSlaPerSec: ramp.firstRateMissingSlaPerSec,
    rampResolutionRel: ramp.rampResolutionRel,
    rampResolutionNote: ramp.rampResolutionNote,
    coarseSustainablePerSec: ramp.coarseSustainablePerSec,
    coarseFirstRateMissingSlaPerSec: ramp.coarseFirstRateMissingSlaPerSec,
    flushStats: rampFlush,
    fractionOfSerialFsyncs: fractionOfSerial,
  },
  compare: {
    durableSustainedRecordsPerSec: impliedProducerCap,
    fsyncsPerSecDuringDurableDrain: durableDrain.flushStats?.fsyncsPerSec ?? null,
    avgBatchSize: durableDrain.flushStats?.avgBatchSize ?? null,
    doubleBufferHits: durableDrain.flushStats?.doubleBufferHits ?? null,
    preDoubleBufferFsyncsPerSecApprox: 3200,
    postDoubleBufferFsyncsPerSec: rampFlush.fsyncsPerSec,
    // true only when post rate moved ≥15% from the ~3.2k pre-double-buffer baseline
    fsyncRateMoved: Math.abs((rampFlush.fsyncsPerSec ?? 0) - 3200) / 3200 >= 0.15,
  },
  reading,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      out: outPath,
      popPerRecordUs: popOnly.perRecordUs,
      encodePerRecordUs: encodeOnly.perRecordUs,
      sequentialEncodeUs: sequentialHandoff.encodePerRecordUs,
      sequentialEnqueueUs: sequentialHandoff.enqueueSyncPerRecordUs,
      noopSustainedPerSec: noopDrain.sustainedRecordsPerSec,
      durableSustainedPerSec: durableDrain.sustainedRecordsPerSec,
      durableN: durableDrain.n,
      durablePerRecordUs: durableDrain.perRecordUs,
      durableFlushFsyncsPerSec: durableDrain.flushStats?.fsyncsPerSec ?? null,
      rampSustainablePerSec: ramp.sustainablePerSec,
      rampFirstMiss: ramp.firstRateMissingSlaPerSec,
      rampResolutionNote: ramp.rampResolutionNote,
      fsyncsPerSec: rampFlush.fsyncsPerSec,
      avgBatchSize: rampFlush.avgBatchSize,
      doubleBufferHits: rampFlush.doubleBufferHits,
      diagnosis: reading.diagnosis,
    },
    null,
    2
  )
);

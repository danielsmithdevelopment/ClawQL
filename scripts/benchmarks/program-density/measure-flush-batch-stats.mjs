/**
 * Short group_commit drain that records fsyncs/sec + avg batch size
 * against the serial fsync ceiling — explains the ~50% gap.
 *
 *   node --import tsx scripts/benchmarks/program-density/measure-flush-batch-stats.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  openTriggerJournalEffect,
  rampSustainableRateEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outPath =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ||
  join(repoRoot, "docs/benchmarks/program-density/flush-batch-stats.json");
const ceilingPath =
  process.env.CLAWQL_DENSITY_FSYNC_CEILING_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");
const workDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-flush-stats";
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const rates = (process.env.CLAWQL_DENSITY_RAMP_RATES || "128000,192000,256000,384000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

mkdirSync(workDir, { recursive: true });

const ceiling = existsSync(ceilingPath)
  ? JSON.parse(readFileSync(ceilingPath, "utf8"))
  : null;
const serialFsyncs = ceiling?.serial?.fsyncsPerSec ?? ceiling?.fsyncsPerSec ?? null;
const theoMax =
  ceiling?.theoreticalMaxGroupCommitPerSec ??
  (serialFsyncs != null ? serialFsyncs * batchMax : null);

const dataSync =
  process.env.CLAWQL_DENSITY_DATA_SYNC === "fdatasync" ? "fdatasync" : "fsync";
const preallocateBytes = process.env.CLAWQL_DENSITY_PREALLOC_BYTES
  ? Number(process.env.CLAWQL_DENSITY_PREALLOC_BYTES)
  : undefined;

const journal = await Effect.runPromise(
  openTriggerJournalEffect(workDir, {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
    dataSync,
    ...(preallocateBytes && preallocateBytes > 0 ? { preallocateBytes } : {}),
  })
);

const sampleIds = Array.from({ length: 4_000 }, (_, i) => `bag_${i}`);
const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

const fire = async (entry) => {
  await journal.record(entry.agentId, entry.deadlineMs);
};

journal.resetFlushStats();
const ramp = await Effect.runPromise(
  rampSustainableRateEffect({
    agentIds: sampleIds,
    fire,
    windowMs: 1_000,
    slaMs: 1_000,
    slaTargetPct: 99,
    concurrency: Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 128),
    ratesPerSec: rates,
    refineRelative: 0.01,
    residentHeapSize: 50_000,
    scheduleShape: "typed_arrays",
    percentile: pct,
  })
);
const flushStatsAcrossRamp = journal.snapshotFlushStats();

// Focused window at the last passing rate — not diluted by coarse ladder steps.
const focusRate = Math.max(1, ramp.sustainablePerSec || 256_000);
journal.resetFlushStats();
const focus = await Effect.runPromise(
  rampSustainableRateEffect({
    agentIds: sampleIds,
    fire,
    windowMs: 2_000,
    slaMs: 1_000,
    slaTargetPct: 99,
    concurrency: Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 128),
    ratesPerSec: [focusRate],
    refineRelative: false,
    residentHeapSize: 50_000,
    scheduleShape: "typed_arrays",
    percentile: pct,
  })
);
const flushStats = journal.snapshotFlushStats();
await journal.close();

const fractionOfSerialFsyncs =
  serialFsyncs && flushStats.fsyncsPerSec
    ? Number((flushStats.fsyncsPerSec / serialFsyncs).toFixed(4))
    : null;
const fractionOfTheoMax =
  theoMax && ramp.sustainablePerSec
    ? Number((ramp.sustainablePerSec / theoMax).toFixed(4))
    : null;
const impliedDurablePerSec = Number(
  (flushStats.fsyncsPerSec * (flushStats.avgBatchSize || 0)).toFixed(2)
);

const probeMeanMs =
  ceiling?.serial?.fsyncLatencyMs?.meanMs ?? ceiling?.serial?.meanFsyncLatencyMs ?? null;
const probeP50 = ceiling?.serial?.fsyncLatencyMs?.p50Ms ?? null;
const runP50 = flushStats.fsyncLatencyMs?.p50 ?? null;
const latencyRatioVsProbe =
  probeP50 && runP50 ? Number((runP50 / probeP50).toFixed(3)) : null;

let diagnosis;
if (fractionOfSerialFsyncs != null && fractionOfSerialFsyncs >= 0.85) {
  diagnosis =
    flushStats.avgBatchFillRatio != null && flushStats.avgBatchFillRatio < 0.75
      ? "disk_busy_batches_early_flush"
      : "disk_busy_near_full_batches";
} else if (latencyRatioVsProbe != null && latencyRatioVsProbe >= 1.5) {
  diagnosis = "under_load_fsync_slower_than_probe_try_fdatasync_prealloc";
} else if (
  flushStats.doubleBuffered &&
  (flushStats.doubleBufferHits ?? 0) > 0 &&
  fractionOfSerialFsyncs != null &&
  fractionOfSerialFsyncs < 0.85
) {
  // Pump profile ruled out producer CPU; residual is durable path (sync latency / journal).
  diagnosis = "durable_path_residual_after_double_buffer_check_sync_latency";
} else if (flushStats.avgBatchFillRatio != null && flushStats.avgBatchFillRatio >= 0.85) {
  diagnosis = "writer_idle_between_fsyncs_consider_double_buffer";
} else {
  diagnosis = "mixed_or_needs_longer_window";
}

const payload = {
  kind: "durable-agent-density-flush-batch-stats",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  flushPolicy: {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
    dataSync,
    preallocateBytes: preallocateBytes ?? null,
  },
  serialCeiling: {
    artifact: ceiling ? "docs/benchmarks/program-density/fsync-ceiling.json" : null,
    fsyncsPerSec: serialFsyncs,
    meanFsyncLatencyMs: probeMeanMs,
    fsyncLatencyMs: ceiling?.serial?.fsyncLatencyMs ?? null,
    theoreticalMaxGroupCommitPerSec: theoMax,
  },
  ramp: {
    sustainablePerSec: ramp.sustainablePerSec,
    firstRateMissingSlaPerSec: ramp.firstRateMissingSlaPerSec,
    rampResolutionRel: ramp.rampResolutionRel,
    rampResolutionNote: ramp.rampResolutionNote,
    coarseSustainablePerSec: ramp.coarseSustainablePerSec,
    coarseFirstRateMissingSlaPerSec: ramp.coarseFirstRateMissingSlaPerSec,
    flushStatsAcrossRamp,
  },
  focus: {
    offeredRatePerSec: focusRate,
    metSla: focus.sustainablePerSec >= focusRate * 0.99,
    flushStats,
  },
  compare: {
    fractionOfSerialFsyncs,
    fractionOfTheoMax,
    impliedDurablePerSec,
    latencyRatioVsProbeP50: latencyRatioVsProbe,
    diagnosis,
    note:
      "Compare focus fsyncLatencyMs.p50/p99 to serial probe. If 2–4× slower with a fast producer, growing-file metadata is the likely gap — trial fdatasync + preallocate (npm run benchmark:program-density-fsync-metadata-arms). Ontologiql: double_buffer_candidate_unverified; producer also fast.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      out: outPath,
      sustainablePerSec: ramp.sustainablePerSec,
      focusRate,
      fsyncsPerSec: flushStats.fsyncsPerSec,
      avgBatchSize: flushStats.avgBatchSize,
      avgBatchFillRatio: flushStats.avgBatchFillRatio,
      impliedDurablePerSec,
      serialFsyncs,
      fractionOfSerialFsyncs,
      fractionOfTheoMax,
      diagnosis,
      flushReasons: {
        batchFull: flushStats.flushReasonBatchFull,
        interval: flushStats.flushReasonInterval,
        forced: flushStats.flushReasonForced,
      },
      doubleBufferHits: flushStats.doubleBufferHits,
      doubleBuffered: flushStats.doubleBuffered,
      fsyncLatencyMs: flushStats.fsyncLatencyMs,
      latencyRatioVsProbeP50: latencyRatioVsProbe,
      dataSync,
    },
    null,
    2
  )
);

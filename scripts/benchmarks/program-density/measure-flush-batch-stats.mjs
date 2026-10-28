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

const journal = await Effect.runPromise(
  openTriggerJournalEffect(workDir, {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
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

let diagnosis;
if (fractionOfSerialFsyncs != null && fractionOfSerialFsyncs >= 0.85) {
  diagnosis =
    flushStats.avgBatchFillRatio != null && flushStats.avgBatchFillRatio < 0.75
      ? "disk_busy_batches_early_flush"
      : "disk_busy_near_full_batches";
} else if (
  flushStats.doubleBuffered &&
  (flushStats.doubleBufferHits ?? 0) > 0 &&
  fractionOfSerialFsyncs != null &&
  fractionOfSerialFsyncs < 0.85
) {
  // Hits prove the buffer works; unchanged fsync rate ⇒ producer-bound, not idle writer.
  diagnosis = "double_buffer_active_fsync_rate_unchanged_producer_bound_under_investigation";
} else if (flushStats.avgBatchFillRatio != null && flushStats.avgBatchFillRatio >= 0.85) {
  diagnosis = "writer_idle_between_fsyncs_consider_double_buffer";
} else {
  diagnosis = "mixed_or_needs_longer_window";
}

const payload = {
  kind: "durable-agent-density-flush-batch-stats",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  flushPolicy: { mode: "group_commit", batchMax, flushIntervalMs: 10 },
  serialCeiling: {
    artifact: ceiling ? "docs/benchmarks/program-density/fsync-ceiling.json" : null,
    fsyncsPerSec: serialFsyncs,
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
    diagnosis,
    note:
      "Focus window at last passing rate. doubleBufferHits≈100% with fsyncs/sec still ~40% of serial ⇒ double-buffer active but not the bottleneck — producer (pump pop/encode/handoff) under investigation. See pump-profile.json. Ontologiql at ~24% of serial may be the same before adding double-buffer.",
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
    },
    null,
    2
  )
);

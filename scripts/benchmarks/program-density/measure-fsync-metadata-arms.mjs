/**
 * Confirm growing-journal metadata cost, then trial fdatasync + preallocate.
 *
 * 1) Relies on fsync-ceiling.json arms (short vs growing vs fdatasync vs prealloc).
 * 2) Runs a board-like group_commit focus window three ways and reports
 *    sustained rate + fsyncs/sec + sync latency p50/p99 (not hit rate alone).
 *
 *   npm run benchmark:program-density-fsync-metadata-arms
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
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
  join(repoRoot, "docs/benchmarks/program-density/fsync-metadata-arms.json");
const ceilingPath =
  process.env.CLAWQL_DENSITY_FSYNC_CEILING_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");
const workRoot = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-fsync-meta-arms";
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const focusRate = Number(process.env.CLAWQL_DENSITY_FOCUS_RATE || 256_000);
const windowMs = Number(process.env.CLAWQL_DENSITY_FOCUS_WINDOW_MS || 2_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 128);
const preallocateBytes = Number(
  process.env.CLAWQL_DENSITY_PREALLOC_BYTES || 256 * 1024 * 1024
);

mkdirSync(workRoot, { recursive: true });

const ceiling = existsSync(ceilingPath)
  ? JSON.parse(readFileSync(ceilingPath, "utf8"))
  : null;
const probeSerial = ceiling?.serial ?? null;
const probeMeanMs = probeSerial?.fsyncLatencyMs?.meanMs ?? probeSerial?.meanFsyncLatencyMs ?? null;
const probeP50 = probeSerial?.fsyncLatencyMs?.p50Ms ?? null;

const sampleIds = Array.from({ length: 4_000 }, (_, i) => `bag_${i}`);
const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

async function runArm(label, policy) {
  const dir = join(workRoot, label);
  mkdirSync(dir, { recursive: true });
  const journal = await Effect.runPromise(openTriggerJournalEffect(dir, policy));
  try {
    // Warm one batch so the focus window is steady-state.
    await Promise.all(
      Array.from({ length: batchMax }, (_, i) => journal.record(`warm_${i}`, i))
    );
    await journal.flush();
    journal.resetFlushStats();
    const ramp = await Effect.runPromise(
      rampSustainableRateEffect({
        agentIds: sampleIds,
        fire: async (entry) => {
          await journal.record(entry.agentId, entry.deadlineMs);
        },
        windowMs,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        ratesPerSec: [focusRate],
        refineRelative: false,
        residentHeapSize: 50_000,
        scheduleShape: "typed_arrays",
        percentile: pct,
      })
    );
    const flushStats = journal.snapshotFlushStats();
    const sustainedRecordsPerSec = flushStats.recordsPerSec;
    const latencyRatioVsProbe =
      probeP50 && flushStats.fsyncLatencyMs?.p50
        ? Number((flushStats.fsyncLatencyMs.p50 / probeP50).toFixed(3))
        : probeMeanMs && flushStats.fsyncLatencyMs?.mean
          ? Number((flushStats.fsyncLatencyMs.mean / probeMeanMs).toFixed(3))
          : null;
    return {
      label,
      policy: {
        mode: policy.mode,
        batchMax: policy.batchMax,
        flushIntervalMs: policy.flushIntervalMs,
        dataSync: policy.dataSync ?? "fsync",
        preallocateBytes: policy.preallocateBytes ?? null,
      },
      offeredRatePerSec: focusRate,
      metSla: ramp.sustainablePerSec >= focusRate * 0.99,
      sustainablePerSecReported: ramp.sustainablePerSec,
      sustainedRecordsPerSec,
      fsyncsPerSec: flushStats.fsyncsPerSec,
      avgBatchSize: flushStats.avgBatchSize,
      doubleBufferHits: flushStats.doubleBufferHits,
      fsyncLatencyMs: flushStats.fsyncLatencyMs,
      latencyRatioVsProbeP50: latencyRatioVsProbe,
      fractionOfSerialFsyncs:
        probeSerial?.fsyncsPerSec && flushStats.fsyncsPerSec
          ? Number((flushStats.fsyncsPerSec / probeSerial.fsyncsPerSec).toFixed(4))
          : null,
    };
  } finally {
    await journal.close();
  }
}

const arms = [];
arms.push(
  await runArm("fsync_append", {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
    dataSync: "fsync",
  })
);
arms.push(
  await runArm("fdatasync_append", {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
    dataSync: "fdatasync",
  })
);
arms.push(
  await runArm("fdatasync_prealloc", {
    mode: "group_commit",
    batchMax,
    flushIntervalMs: 10,
    dataSync: "fdatasync",
    preallocateBytes,
  })
);

const baseline = arms[0];
const compare = arms.map((a) => ({
  label: a.label,
  sustainedRecordsPerSec: a.sustainedRecordsPerSec,
  fsyncsPerSec: a.fsyncsPerSec,
  fsyncLatencyP50Ms: a.fsyncLatencyMs?.p50 ?? null,
  fsyncLatencyP99Ms: a.fsyncLatencyMs?.p99 ?? null,
  latencyRatioVsProbeP50: a.latencyRatioVsProbeP50,
  sustainedOverBaseline:
    baseline?.sustainedRecordsPerSec > 0
      ? Number((a.sustainedRecordsPerSec / baseline.sustainedRecordsPerSec).toFixed(3))
      : null,
  fsyncsOverBaseline:
    baseline?.fsyncsPerSec > 0
      ? Number((a.fsyncsPerSec / baseline.fsyncsPerSec).toFixed(3))
      : null,
}));

const baselineLatencyInflated =
  baseline?.latencyRatioVsProbeP50 != null && baseline.latencyRatioVsProbeP50 >= 1.5;
const best = [...arms].sort((a, b) => b.sustainedRecordsPerSec - a.sustainedRecordsPerSec)[0];
const closedMostOfGap =
  best &&
  baseline &&
  best.label !== baseline.label &&
  best.sustainedRecordsPerSec > baseline.sustainedRecordsPerSec * 1.25;

let diagnosis;
if (baselineLatencyInflated && closedMostOfGap) {
  diagnosis = "growing_metadata_confirmed_fdatasync_or_prealloc_helps";
} else if (baselineLatencyInflated) {
  diagnosis = "under_load_fsync_slower_than_probe_try_fdatasync_prealloc";
} else if (closedMostOfGap) {
  diagnosis = "fdatasync_or_prealloc_improved_rate_without_clear_latency_inflation";
} else {
  diagnosis = "durable_path_residual_not_explained_by_metadata_arms_alone";
}

const payload = {
  kind: "durable-agent-density-fsync-metadata-arms",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  probe: {
    artifact: ceiling ? "docs/benchmarks/program-density/fsync-ceiling.json" : null,
    serialFsyncsPerSec: probeSerial?.fsyncsPerSec ?? null,
    serialLatencyMs: probeSerial?.fsyncLatencyMs ?? {
      meanMs: probeMeanMs,
      p50Ms: probeP50,
    },
    growingLong: ceiling?.serialGrowingLong
      ? {
          fsyncsPerSec: ceiling.serialGrowingLong.fsyncsPerSec,
          latencyMs: ceiling.serialGrowingLong.fsyncLatencyMs,
        }
      : null,
    probeArmsCompare: ceiling?.armsCompare ?? null,
  },
  focus: { offeredRatePerSec: focusRate, windowMs, concurrency, batchMax },
  arms,
  compare,
  reading: {
    diagnosis,
    note:
      "Both ClawQL and Ontologiql pump profiles show a fast producer; residual is the durable write path. If under-load sync p50 is 2–4× the probe, growing-file metadata is the likely culprit. Report sustained rate + fsyncs/sec before/after — not doubleBufferHits alone. Ontologiql label: double_buffer_candidate_unverified.",
    next: closedMostOfGap
      ? "Prefer the winning sync path on both systems for the shared-host campaign so each is near the disk's real limit."
      : "Keep board on fsync append for campaign fairness unless Ontologiql adopts the same experimental path; re-run on the dedicated host.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

if (process.env.CLAWQL_DENSITY_FSYNC_CLEAN === "1" && existsSync(workRoot)) {
  rmSync(workRoot, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      out: outPath,
      diagnosis,
      compare,
      probeSerialFsyncsPerSec: probeSerial?.fsyncsPerSec ?? null,
      probeLatency: probeSerial?.fsyncLatencyMs ?? null,
    },
    null,
    2
  )
);

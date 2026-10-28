/**
 * SHARED_HOST five deadline arms — ClawQL side (and optional peer merge).
 *
 * Arms (identical contract for both systems):
 *   1. steady showcase
 *   2. scaled bursts (first miss; N ≤ agentsAtLimit)
 *   3. sustained-rate ramp (sustainablePerSec + firstRateMissingSlaPerSec)
 *   4. flush crash test (SIGKILL mid-drain)
 *   5. deadline restart (rebuild + overdue catch-up + scheduleFormat)
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/run-shared-host-five-arms.mjs
 *   CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json ...  # merge peer row
 *
 * Peer JSON shape: see docs/benchmarks/program-density/SHARED_HOST.md § Peer artifact.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { Effect } from "effect";
import {
  DEFAULT_SCALED_BURST_SIZES,
  openTriggerJournalEffect,
  rampSustainableRateEffect,
  runDeadlineAccuracyEffect,
  runScaledBurstLadderEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { runDeadlineRestartTestEffect } from "../../../packages/clawql-api/src/program/density/deadline-restart.ts";
import { runTriggerJournalCrashTestEffect } from "../../../packages/clawql-api/src/program/density/trigger-journal-crash.ts";
import { CLAWQL_DEADLINE_SCHEDULE_FORMAT } from "../../../packages/clawql-api/src/program/density/deadline-schedule-store.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const outPath =
  outArg || join(repoRoot, "docs/benchmarks/program-density/shared-host-five-arms.json");
const peerPath = process.env.CLAWQL_DENSITY_PEER_JSON || "";

const agentsAtLimit = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-shared-host";
const steadyN = Number(process.env.CLAWQL_DENSITY_STEADY_N || 2_000);
const horizonMs = Number(process.env.CLAWQL_DENSITY_DEADLINE_HORIZON_MS || 3_000);
const restartLive = Number(process.env.CLAWQL_DENSITY_RESTART_LIVE || 10_000);

const flushPolicy = {
  mode: "group_commit",
  batchMax: Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64),
  flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
};

const burstSizes = (
  process.env.CLAWQL_DENSITY_SCALED_BURST_SIZES ||
  "512,10000,100000,250000,500000"
)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0 && n <= agentsAtLimit);

const rampRates = (
  process.env.CLAWQL_DENSITY_RAMP_RATES ||
  "128000,192000,256000,384000,512000,768000"
)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

mkdirSync(journalDir, { recursive: true });
for (const sub of [".crash", ".fires", ".restart", ".scaled"]) {
  mkdirSync(join(journalDir, sub), { recursive: true });
}

const clawql = await Effect.runPromise(
  Effect.gen(function* () {
    // --- Arm 4 first (cheap independence) + arm 1 steady/burst showcase ---
    const crashTest = yield* runTriggerJournalCrashTestEffect({
      workDir: join(journalDir, ".crash"),
      policy: flushPolicy,
      total: 2_000,
      concurrency: Math.min(32, concurrency),
      killAfterAcks: 400,
    });

    const journal = yield* openTriggerJournalEffect(join(journalDir, ".fires"), flushPolicy);
    const sampleIds = Array.from(
      { length: steadyN },
      (_, i) => `bag_${i.toString(16).padStart(8, "0")}_shared`
    );

    let accuracy;
    let scaledBursts;
    let ramp;
    try {
      const fire = async (entry) => {
        await journal.record(entry.agentId, entry.deadlineMs);
      };

      accuracy = yield* runDeadlineAccuracyEffect({
        agentIds: sampleIds,
        fire,
        horizonMs,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        firedDefinition: "durable_trigger_record",
        flushPolicy,
        residentHeapSize: agentsAtLimit,
        skipRamp: true,
        skipScaledBursts: true,
        crashTest,
        percentile: pct,
      });

      scaledBursts = yield* runScaledBurstLadderEffect({
        fire,
        sizes: burstSizes.length ? burstSizes : DEFAULT_SCALED_BURST_SIZES.filter((n) => n <= agentsAtLimit),
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        residentHeapSize: agentsAtLimit,
        scheduleShape: "typed_arrays",
        percentile: pct,
      });

      ramp = yield* rampSustainableRateEffect({
        agentIds: sampleIds,
        fire,
        windowMs: 1_000,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        ratesPerSec: rampRates,
        residentHeapSize: agentsAtLimit,
        scheduleShape: "typed_arrays",
        percentile: pct,
      });
    } finally {
      yield* Effect.promise(() => journal.close());
    }

    const deadlineRestart = yield* runDeadlineRestartTestEffect({
      workDir: join(journalDir, ".restart"),
      capacity: agentsAtLimit,
      liveCount: Math.min(restartLive, agentsAtLimit),
      downtimeMs: 500,
      policy: flushPolicy,
      concurrency,
      catchUpSlaMs: 1_000,
      percentile: pct,
    });

    return {
      systemId: "clawql-typescript",
      hostLabel: `clawql-cloud-agent-host:${hostname()}`,
      agentsAtLimit,
      flushPolicy,
      scheduleShape: "typed_arrays",
      scheduleFormat: CLAWQL_DEADLINE_SCHEDULE_FORMAT,
      arms: {
        steady: {
          arrivalRatePerSec: accuracy.steady.arrivalRatePerSec,
          pctWithinSla: accuracy.steady.pctWithinSla,
          excessP99Ms: accuracy.steady.excessOverTickP99Ms,
          wallMs: accuracy.steady.wallMs,
        },
        scaledBursts: {
          firstMissSize: scaledBursts.firstMissSize,
          sizes: scaledBursts.sizes,
          arms: scaledBursts.arms.map((a) => ({
            n: a.n,
            pctWithinSla: a.pctWithinSla,
            excessP99Ms: a.excessOverTickP99Ms,
            wallMs: a.wallMs,
            drainPerSec: a.arrivalRatePerSec,
          })),
          note: scaledBursts.note,
        },
        ramp: {
          sustainablePerSec: ramp.sustainablePerSec,
          firstRateMissingSlaPerSec: ramp.firstRateMissingSlaPerSec,
          rampWentPastFailure: ramp.rampWentPastFailure,
          steps: ramp.ramp.map((a) => ({
            arrivalRatePerSec: a.arrivalRatePerSec,
            pctWithinSla: a.pctWithinSla,
            excessP99Ms: a.excessOverTickP99Ms,
          })),
        },
        crashTest: {
          ok: crashTest.ok,
          countedFired: crashTest.countedFired,
          missingFromDisk: crashTest.missingFromDisk,
          duplicateOnDisk: crashTest.duplicateOnDisk,
          note: crashTest.note,
        },
        deadlineRestart: {
          ok: deadlineRestart.ok,
          rebuildMs: deadlineRestart.rebuildMs,
          capacity: deadlineRestart.capacity,
          overdueFired: deadlineRestart.overdueFired,
          overdueExpected: deadlineRestart.overdueExpected,
          missingLive: deadlineRestart.missingLive,
          duplicateFired: deadlineRestart.duplicateFired,
          scheduleFormat: deadlineRestart.scheduleFormat,
          note: deadlineRestart.note,
        },
      },
    };
  })
);

let peer = null;
if (peerPath && existsSync(peerPath)) {
  peer = JSON.parse(readFileSync(peerPath, "utf8"));
}

const payload = {
  kind: "durable-agent-density-shared-host-five-arms",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  reading: {
    sustainedRateNote:
      "Under group_commit(batchMax=64), durable rate ≲ 64 × disk_fsyncs/sec. Gaps across hosts are not a language verdict.",
    rebuildNote:
      "rebuildMs is a schedule-format column — compare only when both disclose onDisk/inMemory/rebuildPath.",
    winCopy: false,
    sharedHostComplete: Boolean(peer),
  },
  clawql,
  peer,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

const summary = {
  out: outPath,
  clawql: {
    firstBurstMiss: clawql.arms.scaledBursts.firstMissSize,
    sustainablePerSec: clawql.arms.ramp.sustainablePerSec,
    firstRateMissingSlaPerSec: clawql.arms.ramp.firstRateMissingSlaPerSec,
    crashOk: clawql.arms.crashTest.ok,
    restartOk: clawql.arms.deadlineRestart.ok,
    rebuildMs: clawql.arms.deadlineRestart.rebuildMs,
  },
  peerPresent: Boolean(peer),
};
console.log(JSON.stringify(summary, null, 2));

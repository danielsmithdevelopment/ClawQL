/**
 * SHARED_HOST five deadline arms — ClawQL side (and optional peer merge).
 *
 * Arms (identical contract for both systems):
 *   1. steady showcase
 *   2. scaled bursts (first miss; N ≤ agentsAtLimit) — REPS → floor
 *   3. sustained-rate ramp — REPS → floor
 *   4. flush crash test (SIGKILL mid-drain)
 *   5. deadline restart (rebuild + overdue catch-up + scheduleFormat)
 *
 * Protocol (SHARED_HOST.md): measure fsync ceiling first; use 3-rep floor for
 * headlines; alternate ClawQL/Ontologiql across reps on one idle host.
 *
 *   CLAWQL_DENSITY_REPS=3 \
 *   CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
 *   npm run benchmark:program-density-shared-host
 *
 *   CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json ...
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
const fsyncPath =
  process.env.CLAWQL_DENSITY_FSYNC_CEILING_JSON ||
  join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");

const agentsAtLimit = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-shared-host";
const steadyN = Number(process.env.CLAWQL_DENSITY_STEADY_N || 2_000);
const horizonMs = Number(process.env.CLAWQL_DENSITY_DEADLINE_HORIZON_MS || 3_000);
const restartLive = Number(process.env.CLAWQL_DENSITY_RESTART_LIVE || 10_000);
const reps = Math.max(1, Number(process.env.CLAWQL_DENSITY_REPS || 1));

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

function floorOf(nums) {
  const xs = nums.filter((n) => typeof n === "number" && Number.isFinite(n));
  return xs.length ? Math.min(...xs) : null;
}

function loadFsyncCeiling() {
  if (!existsSync(fsyncPath)) return null;
  const raw = JSON.parse(readFileSync(fsyncPath, "utf8"));
  const serial = raw.serial ?? null;
  const parallel = raw.parallel ?? null;
  const serialFsyncs =
    serial?.fsyncsPerSec ?? raw.fsyncsPerSec ?? raw.probe?.fsyncsPerSec ?? null;
  return {
    artifact: fsyncPath.replace(`${repoRoot}/`, ""),
    measuredAt: raw.measuredAt ?? null,
    /** PRIMARY — single writer, one sync in flight (board-matched). */
    serial,
    /** Headroom only — multi-writer; do not use as group_commit ceiling. */
    parallel,
    fsyncsPerSec: serialFsyncs,
    theoreticalMaxGroupCommitPerSec:
      raw.theoreticalMaxGroupCommitPerSec ??
      (serialFsyncs != null ? serialFsyncs * flushPolicy.batchMax : null),
    batchMax: raw.flushPolicy?.batchMax ?? flushPolicy.batchMax,
    method: serial?.method ?? raw.probe?.method ?? null,
    hostLabel: raw.host?.label ?? null,
    reading: raw.reading ?? null,
  };
}

mkdirSync(journalDir, { recursive: true });
for (const sub of [".crash", ".fires", ".restart", ".scaled"]) {
  mkdirSync(join(journalDir, sub), { recursive: true });
}

const clawql = await Effect.runPromise(
  Effect.gen(function* () {
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
    const burstReps = [];
    const rampReps = [];
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

      const sizes =
        burstSizes.length ? burstSizes : DEFAULT_SCALED_BURST_SIZES.filter((n) => n <= agentsAtLimit);

      for (let rep = 1; rep <= reps; rep++) {
        const scaledBursts = yield* runScaledBurstLadderEffect({
          fire,
          sizes,
          slaMs: 1_000,
          slaTargetPct: 99,
          concurrency,
          residentHeapSize: agentsAtLimit,
          scheduleShape: "typed_arrays",
          percentile: pct,
        });
        burstReps.push({
          rep,
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
        });

        const ramp = yield* rampSustainableRateEffect({
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
        rampReps.push({
          rep,
          sustainablePerSec: ramp.sustainablePerSec,
          firstRateMissingSlaPerSec: ramp.firstRateMissingSlaPerSec,
          rampWentPastFailure: ramp.rampWentPastFailure,
          coarseSustainablePerSec: ramp.coarseSustainablePerSec,
          coarseFirstRateMissingSlaPerSec: ramp.coarseFirstRateMissingSlaPerSec,
          rampResolutionRel: ramp.rampResolutionRel,
          rampResolutionNote: ramp.rampResolutionNote,
          steps: ramp.ramp.map((a) => ({
            arrivalRatePerSec: a.arrivalRatePerSec,
            pctWithinSla: a.pctWithinSla,
            excessP99Ms: a.excessOverTickP99Ms,
          })),
        });

        if (reps > 1) {
          console.error(
            JSON.stringify({
              phase: "clawql_rep_done",
              rep,
              reps,
              hint: "Alternate: run Ontologiql for this same rep before ClawQL's next rep (SHARED_HOST.md).",
              firstBurstMiss: scaledBursts.firstMissSize,
              sustainablePerSec: ramp.sustainablePerSec,
            })
          );
        }
      }
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

    const lastBurst = burstReps.at(-1);
    const lastRamp = rampReps.at(-1);
    const headline = {
      rule: "three_rep_floor",
      reps,
      sustainablePerSec: floorOf(rampReps.map((r) => r.sustainablePerSec)),
      firstRateMissingSlaPerSec: floorOf(rampReps.map((r) => r.firstRateMissingSlaPerSec)),
      scaledBurstFirstMissSize: floorOf(burstReps.map((r) => r.firstMissSize)),
      note:
        reps >= 3
          ? "Headlines are min(reps). Do not compare a single run to another system's floor."
          : `REPS=${reps} — campaign headlines require REPS=3 (SHARED_HOST.md). Current values are not a 3-rep floor.`,
    };

    return {
      systemId: "clawql-typescript",
      hostLabel: `clawql-cloud-agent-host:${hostname()}`,
      agentsAtLimit,
      flushPolicy,
      scheduleShape: "typed_arrays",
      scheduleFormat: CLAWQL_DEADLINE_SCHEDULE_FORMAT,
      headline,
      arms: {
        steady: {
          arrivalRatePerSec: accuracy.steady.arrivalRatePerSec,
          pctWithinSla: accuracy.steady.pctWithinSla,
          excessP99Ms: accuracy.steady.excessOverTickP99Ms,
          wallMs: accuracy.steady.wallMs,
        },
        scaledBursts: {
          firstMissSize: headline.scaledBurstFirstMissSize,
          sizes: lastBurst?.sizes ?? [],
          arms: lastBurst?.arms ?? [],
          reps: burstReps,
          note: lastBurst?.note,
        },
        ramp: {
          sustainablePerSec: headline.sustainablePerSec,
          firstRateMissingSlaPerSec: headline.firstRateMissingSlaPerSec,
          rampWentPastFailure: rampReps.every((r) => r.rampWentPastFailure),
          coarseSustainablePerSec: lastRamp?.coarseSustainablePerSec ?? null,
          coarseFirstRateMissingSlaPerSec: lastRamp?.coarseFirstRateMissingSlaPerSec ?? null,
          rampResolutionRel:
            rampReps.length > 0
              ? Math.max(...rampReps.map((r) => r.rampResolutionRel ?? 0))
              : null,
          rampResolutionNote: lastRamp?.rampResolutionNote ?? null,
          steps: lastRamp?.steps ?? [],
          reps: rampReps,
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

const fsyncCeiling = loadFsyncCeiling();

function hasThreeRepFloor(row) {
  if (!row) return false;
  const n = row.headline?.reps ?? row.arms?.ramp?.reps?.length ?? 0;
  return n >= 3 && row.headline?.rule === "three_rep_floor";
}

const sharedHostComplete = Boolean(
  peer && fsyncCeiling && hasThreeRepFloor(clawql) && hasThreeRepFloor(peer)
);

const payload = {
  kind: "durable-agent-density-shared-host-five-arms",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  protocol: {
    headlineRule: "three_rep_floor",
    requiredReps: 3,
    alternation: "clawql_then_ontologiql_each_rep",
    fsyncCeilingFirst: true,
    idleHost: true,
    sameAgentsAtLimit: true,
    sameDiskAsFsyncProbe: true,
  },
  fsyncCeiling,
  reading: {
    sustainedRateNote:
      "Under group_commit(batchMax=64), durable rate ≲ 64 × disk_fsyncs/sec. Report sustainablePerSec as a fraction of fsyncCeiling.theoreticalMaxGroupCommitPerSec. Near ceiling on both ⇒ equal / disk-bound.",
    rebuildNote:
      "rebuildMs is a schedule-format column — compare only when both disclose onDisk/inMemory/rebuildPath.",
    headlineNote:
      "Board headlines use min of 3 reps per system. Never compare one system's single run to the other's floor.",
    alternationNote:
      "Interleave systems across reps (ClawQL₁ → Ontologiql₁ → …). Do not run all of one then all of the other.",
    winCopy: false,
    sharedHostComplete,
    completeGates: {
      peerPresent: Boolean(peer),
      fsyncCeilingPresent: Boolean(fsyncCeiling),
      clawqlThreeRepFloor: hasThreeRepFloor(clawql),
      peerThreeRepFloor: hasThreeRepFloor(peer),
    },
  },
  clawql,
  peer,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

const fraction =
  fsyncCeiling?.theoreticalMaxGroupCommitPerSec && clawql.headline.sustainablePerSec != null
    ? Number(
        (clawql.headline.sustainablePerSec / fsyncCeiling.theoreticalMaxGroupCommitPerSec).toFixed(3)
      )
    : null;

console.log(
  JSON.stringify(
    {
      out: outPath,
      reps,
      fsyncCeilingPresent: Boolean(fsyncCeiling),
      clawql: {
        headline: clawql.headline,
        fractionOfFsyncCeiling: fraction,
        crashOk: clawql.arms.crashTest.ok,
        restartOk: clawql.arms.deadlineRestart.ok,
        rebuildMs: clawql.arms.deadlineRestart.rebuildMs,
      },
      peerPresent: Boolean(peer),
      sharedHostComplete,
    },
    null,
    2
  )
);

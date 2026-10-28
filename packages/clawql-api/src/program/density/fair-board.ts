/**
 * Fair parked-agent density board for ClawQL TypeScript.
 *
 * Methodology (v5 — wake-deadline schedule at limit):
 * - Ceiling / agents-at-limit = **first resource exhausted** (disk | rss | latency).
 * - Limit runs **must** retain an in-memory **wake-deadline schedule** for every
 *   counted agent (approval expiry / reminder). Bag path is derived from agentId
 *   (filesystem is the id index) — path Maps are not the capacity story.
 * - Board adds **deadlineLatenessMs** (p50/p99). Cold wake: report median + range
 *   across order reps; do not cross-compare cold until shared-host.
 * - Trim of id/path records alone likely makes both systems disk-bound; bag size
 *   then decides capacity (~30 vs ~32.8 KiB). Deadline state is the real resident.
 *
 * Active-density lab pulse is out of scope for the public parked claim.
 */

import { fork, spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  clearBagDirEffect,
  makeParkedBagApi,
  resolveBagDirEffect,
  type ParkedBagApi,
} from "./bag-store.js";
import { FAIR_DEADLINE_HORIZON_MS, buildFairParkedAgentEffect } from "./fair-agent.js";
import {
  makeDeadlineScheduleEffect,
  randomDeadlineMsEffect,
  runDeadlinePumpEffect,
  type DeadlineSchedule,
} from "./deadline-schedule.js";
import {
  createGcRecorderEffect,
  evictBagPageCacheEffect,
  exposeGcAvailableEffect,
  hostIdentityEffect,
  measureBagPageCacheKiBEffect,
  percentileMsEffect,
  readDiskAvailBytesEffect,
  readHeapSnapshotEffect,
  readMemTotalKiBEffect,
  type GcRecorder,
} from "./host-metrics.js";
import type {
  BoardColumns,
  EvidenceFair,
  FairRampStep,
  DensitySystemRow,
  LimitResource,
  WakeLatency,
  WakeOrderId,
  WakeOrderResult,
  WakeSpread,
  ResidentAccounting,
} from "./types.js";
import { FAIR_CONTRACT_ID } from "./types.js";

/** Fast disk total for large bag dirs (`du -sb`). Falls back to API walk. */
function diskBytesFast(bags: ParkedBagApi): Effect.Effect<number> {
  return Effect.gen(function* () {
    const res = spawnSync("du", ["-sb", bags.bagDir], { encoding: "utf8" });
    if (res.status === 0) {
      const n = Number((res.stdout || "").trim().split(/\s+/)[0]);
      if (Number.isFinite(n)) return n;
    }
    return yield* bags.diskBytesTotal().pipe(Effect.catchAll(() => Effect.succeed(0)));
  });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const RESTART_WORKER = join(HERE, "restart-worker.ts");

export type FairBoardOptions = {
  readonly bagDir?: string;
  readonly rssCeilingMiB?: number;
  readonly rampSchedule?: readonly number[];
  readonly continueUntilCeiling?: boolean;
  readonly wakeSampleSize?: number;
  readonly wakeWarmupCount?: number;
  readonly wakeOrderRepetitions?: number;
  readonly wakeColdP99CeilingMs?: number;
  /** Random wake deadlines spread over this horizon (ms). */
  readonly deadlineHorizonMs?: number;
  /** Max deadline fires (bag wakes) measured for lateness p99. */
  readonly deadlineMaxFires?: number;
  readonly hostLabel?: string;
  readonly skipCold?: boolean;
  readonly skipRestart?: boolean;
  readonly skipDeadlinePump?: boolean;
  readonly reuseBags?: boolean;
  readonly resumeFromAgents?: number;
};

const DEFAULT_RAMP: readonly number[] = [
  100, 500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 300_000, 400_000,
  500_000, 750_000, 1_000_000,
];

/**
 * Ontologiql public claim (publishable) — mirrored for the comparison table.
 * Deadline lateness is null until Ontologiql remeasures under the v2 contract.
 */
export const ONTOLOGIQL_PUBLISHABLE_ROW: DensitySystemRow = {
  systemId: "ontologiql-rust",
  status: "publishable",
  hostLabel: "stable-host (Ontologiql published)",
  honesty:
    "Ontologiql Rust fair row is publishable on the pre-deadline contract (200k @ ≤512 MiB total RSS, ~30 KiB disk/agent, warm p99 < 35 µs, cold p99 < 0.6 ms, restart). ~2 KiB resident/agent can likely shrink to tens of bytes if path is derived and the FS is the id index — same as TS Map overhead. Once both trim, capacity is disk-bound and bag size decides (~30 vs ~32.8 KiB). **deadlineLatenessMs not yet measured** — invite Ontologiql to remeasure under fair-v2 (wake deadline + on-time fire). Do not read cold-wake gaps until shared-host.",
  boardColumns: {
    agentsAtLimit: 200_000,
    limitResource: "rss",
    residentKiBPerAgent: Number(((512 * 1024) / 200_000).toFixed(3)),
    pageCacheKiBPerAgent: null,
    diskBytesPerAgent: 30 * 1024,
    wakeWarmMs: { p50: 0.000035, p99: 0.000035 },
    wakeColdMs: { p50: 0.6, p99: 0.6 },
    deadlineLatenessMs: null,
    restartSurvival: true,
  },
  activeDensityLab: null,
};

/** Bag path is derived — not stored in the deadline schedule. */
function bagPathFor(bagDir: string, agentId: string): string {
  return join(bagDir, `${agentId}.json`);
}

function parkUpTo(
  bags: ParkedBagApi,
  fromExclusive: number,
  toInclusive: number,
  schedule: DeadlineSchedule,
  nowMs: number,
  horizonMs: number
): string[] {
  mkdirSync(bags.bagDir, { recursive: true, mode: 0o700 });
  const ids: string[] = [];
  for (let i = fromExclusive; i < toInclusive; i++) {
    const deadlineMs = Effect.runSync(randomDeadlineMsEffect(nowMs, horizonMs));
    const agent = Effect.runSync(
      buildFairParkedAgentEffect(i, undefined, {
        nowMs,
        deadlineHorizonMs: horizonMs,
        wakeDeadlineAt: new Date(deadlineMs).toISOString(),
      })
    );
    const path = bagPathFor(bags.bagDir, agent.agentId);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(agent)}\n`, { mode: 0o600 });
    renameSync(tmp, path);
    schedule.schedule(agent.agentId, deadlineMs);
    ids.push(agent.agentId);
  }
  return ids;
}

function pickSampleIds(ids: readonly string[], sampleSize: number): string[] {
  const n = Math.min(sampleSize, ids.length);
  if (n <= 0) return [];
  const out: string[] = [];
  for (let s = 0; s < n; s++) out.push(ids[Math.floor((s * ids.length) / n)]!);
  return out;
}

function sampleIdsFromBagDir(
  bagDir: string,
  sampleSize: number
): {
  readonly sampleIds: string[];
  readonly seen: number;
} {
  const stride = Math.max(1, Math.floor(50_000 / Math.max(1, sampleSize)));
  const res = spawnSync(
    "bash",
    [
      "-c",
      `find "$1" -maxdepth 1 -name 'bag_*.json' -printf '%f\\n' | awk -v n="$2" -v s="$3" '
        { c++; if (c % s == 1) { sub(/\\.json$/,""); print; if (++k >= n) exit } }
        END { print "__COUNT__" c }'`,
      "awk-sample",
      bagDir,
      String(sampleSize),
      String(stride),
    ],
    { encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }
  );
  if (res.status !== 0) return { sampleIds: [], seen: 0 };
  const lines = (res.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let seen = 0;
  const sampleIds: string[] = [];
  for (const line of lines) {
    if (line.startsWith("__COUNT__")) {
      seen = Number(line.slice("__COUNT__".length)) || 0;
      continue;
    }
    if (line.startsWith("bag_")) sampleIds.push(line);
  }
  return { sampleIds, seen };
}

/**
 * Stream bag ids into the deadline schedule (synthetic deadlines for reuse dirs
 * that predate fair-v2). Path is not stored — derived on wake.
 */
function loadDeadlineScheduleFromBagDir(args: {
  readonly bagDir: string;
  readonly schedule: DeadlineSchedule;
  readonly rssCeilingKiB: number;
  readonly checkpointEvery: number;
  readonly maxIds?: number;
  readonly reservoirSize: number;
  readonly nowMs: number;
  readonly horizonMs: number;
  readonly readRssKiB: () => number;
  readonly onCheckpoint: (n: number, rssKiB: number, within: boolean) => void;
}): Promise<{
  readonly loaded: number;
  readonly rssHit: boolean;
  readonly sampleIds: string[];
}> {
  const {
    bagDir,
    schedule,
    rssCeilingKiB,
    checkpointEvery,
    maxIds,
    reservoirSize,
    nowMs,
    horizonMs,
    readRssKiB,
    onCheckpoint,
  } = args;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "find",
      [bagDir, "-maxdepth", "1", "-name", "bag_*.json", "-printf", "%f\\n"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const rl = createInterface({ input: child.stdout! });
    const sampleIds: string[] = [];
    let loaded = 0;
    let rssHit = false;
    let settled = false;
    let nextCheckpoint = checkpointEvery;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      rl.close();
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve({ loaded, rssHit, sampleIds });
    };

    rl.on("line", (line) => {
      if (rssHit || settled) return;
      const name = line.trim();
      if (!name.endsWith(".json")) return;
      const id = name.slice(0, -".json".length);
      if (!id.startsWith("bag_")) return;
      const deadlineMs = Effect.runSync(randomDeadlineMsEffect(nowMs, horizonMs));
      schedule.schedule(id, deadlineMs);
      loaded += 1;
      if (sampleIds.length < reservoirSize) sampleIds.push(id);
      else {
        const j = Math.floor(Math.random() * loaded);
        if (j < reservoirSize) sampleIds[j] = id;
      }
      if (loaded >= nextCheckpoint || (maxIds !== undefined && loaded >= maxIds)) {
        const rssKiB = readRssKiB();
        const within = rssKiB <= rssCeilingKiB;
        onCheckpoint(loaded, rssKiB, within);
        nextCheckpoint += checkpointEvery;
        if (!within) {
          rssHit = true;
          finish();
          return;
        }
        if (maxIds !== undefined && loaded >= maxIds) finish();
      }
    });
    rl.on("close", () => {
      if (settled) return;
      if (loaded > 0) {
        const rssKiB = readRssKiB();
        onCheckpoint(loaded, rssKiB, rssKiB <= rssCeilingKiB);
        if (rssKiB > rssCeilingKiB) rssHit = true;
      }
      finish();
    });
    child.on("error", (err) => finish(err));
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("exit", (code) => {
      if (settled) return;
      if (code !== 0 && code !== null) {
        finish(new Error(`find exit ${code}: ${stderr.slice(0, 200)}`));
      }
    });
  });
}

async function sampleWakeMs(
  bags: ParkedBagApi,
  sampleIds: readonly string[],
  gc: GcRecorder | null
): Promise<{ readonly samplesMs: number[]; readonly gc: ReturnType<GcRecorder["stop"]> }> {
  gc?.start();
  const samples: number[] = [];
  for (const id of sampleIds) {
    const t0 = process.hrtime.bigint();
    await Effect.runPromise(bags.wake(id));
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  return { samplesMs: samples, gc: gc?.stop() ?? { count: 0, totalMs: 0, maxMs: 0 } };
}

async function latencyFromSamples(samplesMs: readonly number[]): Promise<WakeLatency> {
  const p50 = await Effect.runPromise(percentileMsEffect(samplesMs, 50));
  const p99 = await Effect.runPromise(percentileMsEffect(samplesMs, 99));
  return {
    p50: Number(p50.toFixed(6)),
    p99: Number(p99.toFixed(6)),
    n: samplesMs.length,
  };
}

function poolLatencies(parts: readonly WakeLatency[]): WakeLatency {
  if (parts.length === 0) return { p50: 0, p99: 0, n: 0 };
  const n = parts.reduce((a, p) => a + p.n, 0);
  const p50 = parts.reduce((a, p) => a + p.p50 * p.n, 0) / Math.max(1, n);
  const p99 = Math.max(...parts.map((p) => p.p99));
  return { p50: Number(p50.toFixed(6)), p99: Number(p99.toFixed(6)), n };
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function computeWakeSpread(wakeByOrder: readonly WakeOrderResult[]): WakeSpread[] {
  const orders: WakeOrderId[] = ["warm_then_cold", "cold_then_warm"];
  return orders.map((order) => {
    const reps = wakeByOrder.filter((o) => o.order === order && o.cold.n > 0);
    const cold = reps.map((r) => r.cold.p99);
    const warm = reps.map((r) => r.warm.p99);
    return {
      order,
      coldP99Min: cold.length ? Math.min(...cold) : 0,
      coldP99Max: cold.length ? Math.max(...cold) : 0,
      coldP99Median: Number(medianOf(cold).toFixed(6)),
      warmP99Min: warm.length ? Math.min(...warm) : 0,
      warmP99Max: warm.length ? Math.max(...warm) : 0,
      warmP99Median: Number(medianOf(warm).toFixed(6)),
      repetitions: reps.length,
    };
  });
}

/** Headline warm uses slower-cold order (by coldP99Max); cold quotes use spread median+range. */
function pickHeadlineOrder(
  wakeByOrder: readonly WakeOrderResult[],
  wakeSpread: readonly WakeSpread[]
): WakeOrderResult {
  const ranked = [...wakeSpread]
    .filter((s) => s.repetitions > 0)
    .sort((a, b) => b.coldP99Max - a.coldP99Max || b.coldP99Median - a.coldP99Median);
  const slower = ranked[0]?.order ?? "warm_then_cold";
  const reps = wakeByOrder.filter((o) => o.order === slower && o.cold.n > 0);
  if (reps.length === 0) return wakeByOrder[0]!;
  return [...reps].sort((a, b) => b.cold.p99 - a.cold.p99)[0]!;
}

function runRestartWorker(env: Readonly<Record<string, string>>): Promise<{
  readonly ok: boolean;
  readonly detail: string;
}> {
  return new Promise((resolve) => {
    const child = fork(RESTART_WORKER, [], {
      execArgv: ["--import", "tsx", "--expose-gc"],
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout.trim().split("\n").at(-1) || "{}") as {
            ok?: boolean;
            detail?: string;
          };
          resolve({ ok: parsed.ok === true, detail: parsed.detail ?? "restart ok" });
        } catch {
          resolve({ ok: false, detail: `bad worker stdout: ${stdout.slice(0, 200)}` });
        }
      } else {
        resolve({
          ok: false,
          detail: `restart worker exit ${code}: ${stderr.slice(0, 300)}`,
        });
      }
    });
  });
}

function buildRampTargets(schedule: readonly number[], continueUntilCeiling: boolean): number[] {
  const targets = [...schedule].filter((n) => n > 0).sort((a, b) => a - b);
  if (!continueUntilCeiling || targets.length === 0) return targets;
  let last = targets[targets.length - 1]!;
  for (let i = 0; i < 24; i++) {
    const next = Math.min(last * 2, last + 500_000);
    if (next <= last) break;
    targets.push(next);
    last = next;
  }
  return targets;
}

function rssGrowthPerAgentKiB(ramp: readonly FairRampStep[]): number {
  if (ramp.length < 2) return 0;
  const a = ramp[ramp.length - 2]!;
  const b = ramp[ramp.length - 1]!;
  const dAgents = b.agents - a.agents;
  if (dAgents <= 0) return 0;
  return Math.max(0, (b.rssKiB - a.rssKiB) / dAgents);
}

function classifyLimit(args: {
  readonly rssHit: boolean;
  readonly agentsAtLimit: number;
  readonly rssKiB: number;
  readonly rssCeilingKiB: number;
  readonly rssCeilingMiB: number;
  readonly diskBytesPerAgent: number;
  readonly diskAvailBytes: number | null;
  readonly ramp: readonly FairRampStep[];
  readonly nextParkBatch: number | null;
  readonly coldP99Ms: number | null;
  readonly wakeColdP99CeilingMs: number | null;
}): {
  readonly limitResource: LimitResource;
  readonly limitHit: boolean;
  readonly limitReason: string;
  readonly agentsAtLimit: number;
} {
  if (args.rssHit) {
    return {
      limitResource: "rss",
      limitHit: true,
      limitReason: `total process RSS exceeded ${args.rssCeilingMiB} MiB at ${args.agentsAtLimit} agents (rss=${args.rssKiB} KiB, ceiling=${args.rssCeilingKiB} KiB)`,
      agentsAtLimit: args.agentsAtLimit,
    };
  }

  const bytesPer = Math.max(1, args.diskBytesPerAgent);
  const roomOnDisk =
    args.diskAvailBytes !== null
      ? Math.floor(args.diskAvailBytes / bytesPer)
      : Number.POSITIVE_INFINITY;
  const growth = rssGrowthPerAgentKiB(args.ramp);
  const rssHeadroomKiB = Math.max(0, args.rssCeilingKiB - args.rssKiB);
  const roomInRss = growth > 1e-6 ? Math.floor(rssHeadroomKiB / growth) : Number.POSITIVE_INFINITY;
  const nextBatch = args.nextParkBatch;
  const nextBatchBlocked =
    nextBatch !== null &&
    args.diskAvailBytes !== null &&
    nextBatch * bytesPer > args.diskAvailBytes;

  if (
    args.diskAvailBytes !== null &&
    (nextBatchBlocked || (Number.isFinite(roomOnDisk) && roomOnDisk < roomInRss))
  ) {
    return {
      limitResource: "disk",
      limitHit: true,
      limitReason: `disk exhausted first at ${args.agentsAtLimit} agents (avail=${args.diskAvailBytes} B ≈ ${roomOnDisk} more agents @ ${bytesPer} B/agent; RSS headroom ≈ ${roomInRss === Number.POSITIVE_INFINITY ? "∞" : roomInRss} agents at growth ${growth.toFixed(6)} KiB/agent)`,
      agentsAtLimit: args.agentsAtLimit,
    };
  }

  if (
    args.wakeColdP99CeilingMs != null &&
    args.coldP99Ms != null &&
    args.coldP99Ms > args.wakeColdP99CeilingMs
  ) {
    return {
      limitResource: "latency",
      limitHit: true,
      limitReason: `cold wake p99 ${args.coldP99Ms} ms exceeded ceiling ${args.wakeColdP99CeilingMs} ms at ${args.agentsAtLimit} agents`,
      agentsAtLimit: args.agentsAtLimit,
    };
  }

  return {
    limitResource: "none",
    limitHit: false,
    limitReason: `completed ramp through ${args.agentsAtLimit} without exhausting disk, ${args.rssCeilingMiB} MiB total RSS, or a configured cold-wake latency ceiling`,
    agentsAtLimit: args.agentsAtLimit,
  };
}

export function runFairDensityBoardEffect(
  options: FairBoardOptions = {}
): Effect.Effect<EvidenceFair> {
  return Effect.gen(function* () {
    const bagDir = options.bagDir ?? (yield* resolveBagDirEffect());
    const rssCeilingMiB = options.rssCeilingMiB ?? 512;
    const continueUntilCeiling = options.continueUntilCeiling !== false;
    const rampSchedule = buildRampTargets(
      options.rampSchedule ?? DEFAULT_RAMP,
      options.rampSchedule ? false : continueUntilCeiling
    );
    const wakeSampleSize = options.wakeSampleSize ?? 200;
    const wakeWarmupCount =
      options.wakeWarmupCount ?? Math.min(3_000, Math.max(wakeSampleSize, 500));
    const wakeOrderRepetitions = Math.max(1, options.wakeOrderRepetitions ?? 3);
    const wakeColdP99CeilingMs =
      options.wakeColdP99CeilingMs != null && Number.isFinite(options.wakeColdP99CeilingMs)
        ? options.wakeColdP99CeilingMs
        : null;
    const deadlineHorizonMs = options.deadlineHorizonMs ?? FAIR_DEADLINE_HORIZON_MS;
    const deadlineMaxFires = options.deadlineMaxFires ?? 2_000;
    const hostLabel = options.hostLabel ?? "clawql-cloud-agent-host";
    const rssCeilingKiB = rssCeilingMiB * 1024;
    const exposeGc = yield* exposeGcAvailableEffect();

    const reuseBags = options.reuseBags === true;
    if (!reuseBags) {
      yield* clearBagDirEffect(bagDir);
    }
    const bags = makeParkedBagApi(bagDir);
    const host = yield* hostIdentityEffect();
    const memTotalKiB = yield* readMemTotalKiBEffect();

    const baseline = yield* readHeapSnapshotEffect();
    const schedule = yield* makeDeadlineScheduleEffect();
    const ramp: FairRampStep[] = [];
    let agentsAtLimit = 0;
    let rssHit = false;
    let diskBlockedDuringPark = false;
    let diskBlockDetail = "";
    let indexSampleIds: string[] = [];
    let bagsOnDisk =
      reuseBags && (options.resumeFromAgents ?? 0) > 0 ? (options.resumeFromAgents as number) : 0;
    const scheduleEpochMs = Date.now();

    const perBagDiskBytes = (diskTotal: number, indexedN: number): number => {
      const denom = Math.max(1, bagsOnDisk > 0 ? bagsOnDisk : indexedN);
      return diskTotal / denom;
    };

    const pushRampCheckpoint = (n: number, rssKiB: number, heapUsedKiB: number) =>
      Effect.gen(function* () {
        const disk = yield* diskBytesFast(bags);
        const diskAvailBytes = yield* readDiskAvailBytesEffect(bagDir);
        const rssDelta = Math.max(0, rssKiB - baseline.rssKiB);
        const within = rssKiB <= rssCeilingKiB;
        if (bagsOnDisk < n) bagsOnDisk = n;
        ramp.push({
          agents: n,
          rssKiB,
          residentKiBPerAgent: rssKiB / Math.max(1, n),
          rssDeltaKiBPerAgent: rssDelta / Math.max(1, n),
          heapUsedKiBAfterGc: heapUsedKiB,
          heapUsedKiBPerAgentAfterGc: heapUsedKiB / Math.max(1, n),
          diskBytesTotal: disk,
          diskBytesPerAgent: perBagDiskBytes(disk, n),
          diskAvailBytes,
          pageCacheKiBPerAgent: null,
          withinRssCeiling: within,
        });
        agentsAtLimit = n;
        return within;
      });

    let prev = 0;
    if (reuseBags) {
      const resumeFrom = options.resumeFromAgents ?? 0;
      const loadTarget = resumeFrom > 0 ? resumeFrom : undefined;
      const loaded = yield* Effect.promise(() =>
        loadDeadlineScheduleFromBagDir({
          bagDir,
          schedule,
          rssCeilingKiB,
          checkpointEvery: 250_000,
          maxIds: loadTarget,
          reservoirSize: Math.max(wakeSampleSize, wakeWarmupCount, 1),
          nowMs: scheduleEpochMs,
          horizonMs: deadlineHorizonMs,
          readRssKiB: () => Effect.runSync(readHeapSnapshotEffect()).rssKiB,
          onCheckpoint: (n, rssKiB, within) => {
            const heap = Effect.runSync(readHeapSnapshotEffect());
            const disk = Effect.runSync(diskBytesFast(bags));
            const diskAvailBytes = Effect.runSync(readDiskAvailBytesEffect(bagDir));
            const rssDelta = Math.max(0, rssKiB - baseline.rssKiB);
            ramp.push({
              agents: n,
              rssKiB,
              residentKiBPerAgent: rssKiB / Math.max(1, n),
              rssDeltaKiBPerAgent: rssDelta / Math.max(1, n),
              heapUsedKiBAfterGc: heap.heapUsedKiB,
              heapUsedKiBPerAgentAfterGc: heap.heapUsedKiB / Math.max(1, n),
              diskBytesTotal: disk,
              diskBytesPerAgent: perBagDiskBytes(disk, n),
              diskAvailBytes,
              pageCacheKiBPerAgent: null,
              withinRssCeiling: within,
            });
            agentsAtLimit = n;
          },
        })
      );
      indexSampleIds = loaded.sampleIds;
      prev = schedule.size();
      agentsAtLimit = schedule.size();
      if (loaded.rssHit) {
        rssHit = true;
        const lastWithin = [...ramp].reverse().find((s) => s.withinRssCeiling);
        if (lastWithin) agentsAtLimit = lastWithin.agents;
      } else if (schedule.size() > 0) {
        const heap = yield* readHeapSnapshotEffect();
        if (heap.rssKiB > rssCeilingKiB) {
          rssHit = true;
          const lastWithin = [...ramp].reverse().find((s) => s.withinRssCeiling);
          if (lastWithin) agentsAtLimit = lastWithin.agents;
        } else if (ramp.length === 0 || ramp[ramp.length - 1]!.agents !== schedule.size()) {
          yield* pushRampCheckpoint(schedule.size(), heap.rssKiB, heap.heapUsedKiB);
        }
      }
    }

    for (const target of rampSchedule) {
      if (rssHit || diskBlockedDuringPark) break;
      if (target <= prev) continue;

      const diskAvailBefore = yield* readDiskAvailBytesEffect(bagDir);
      const bytesPerEstimate =
        ramp.length > 0 ? ramp[ramp.length - 1]!.diskBytesPerAgent : 33 * 1024;
      const needBytes = (target - prev) * Math.max(1, bytesPerEstimate);
      if (diskAvailBefore !== null && needBytes > diskAvailBefore) {
        diskBlockedDuringPark = true;
        diskBlockDetail = `next park to ${target} needs ~${needBytes} B; avail=${diskAvailBefore} B`;
        break;
      }

      let batch: string[];
      try {
        batch = parkUpTo(bags, prev, target, schedule, Date.now(), deadlineHorizonMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/ENOSPC|no space/i.test(msg)) {
          diskBlockedDuringPark = true;
          diskBlockDetail = `ENOSPC while parking toward ${target}: ${msg}`;
          break;
        }
        throw err;
      }
      const reservoirCap = Math.max(wakeSampleSize, wakeWarmupCount, 1);
      for (let i = 0; i < batch.length; i++) {
        const id = batch[i]!;
        const n = schedule.size() - batch.length + i + 1;
        if (indexSampleIds.length < reservoirCap) indexSampleIds.push(id);
        else {
          const j = Math.floor(Math.random() * n);
          if (j < reservoirCap) indexSampleIds[j] = id;
        }
      }
      prev = target;

      const heap = yield* readHeapSnapshotEffect();
      const within = yield* pushRampCheckpoint(target, heap.rssKiB, heap.heapUsedKiB);
      if (!within) {
        rssHit = true;
        const lastWithin = [...ramp].reverse().find((s) => s.withinRssCeiling);
        if (lastWithin) agentsAtLimit = lastWithin.agents;
        break;
      }
    }

    if (!rssHit && schedule.size() > 0) {
      agentsAtLimit = schedule.size();
    }
    if (schedule.size() > agentsAtLimit && agentsAtLimit > 0) {
      schedule.trimTo(agentsAtLimit);
    }

    const atLimit = yield* readHeapSnapshotEffect();
    const last =
      ramp.find((s) => s.agents === agentsAtLimit) ??
      [...ramp].reverse().find((s) => s.withinRssCeiling) ??
      ramp[ramp.length - 1]!;
    const pageCacheKiB = yield* measureBagPageCacheKiBEffect(bagDir, 2_000, agentsAtLimit);
    const pageCacheKiBPerAgent =
      pageCacheKiB !== null && agentsAtLimit > 0 ? pageCacheKiB / agentsAtLimit : null;
    const lastIdx = ramp.findIndex((s) => s.agents === last.agents);
    if (lastIdx >= 0) {
      ramp[lastIdx] = { ...ramp[lastIdx]!, pageCacheKiBPerAgent };
    }

    // --- Deadline pump on a sample schedule; full schedule stays retained for RSS ---
    let deadlineLateness: {
      readonly p50: number;
      readonly p99: number;
      readonly n: number;
      readonly fired: number;
      readonly maxLatenessMs: number;
    } | null = null;
    if (!options.skipDeadlinePump && schedule.size() > 0) {
      const pumpSchedule = yield* makeDeadlineScheduleEffect();
      const soonest = [...schedule.entries()]
        .sort((a, b) => a.deadlineMs - b.deadlineMs)
        .slice(0, Math.min(deadlineMaxFires, schedule.size()));
      for (const e of soonest) pumpSchedule.schedule(e.agentId, e.deadlineMs);
      const pump = yield* runDeadlinePumpEffect({
        schedule: pumpSchedule,
        wake: async (agentId) => {
          await Effect.runPromise(bags.wake(agentId));
        },
        maxFires: soonest.length,
        wallDeadlineMs: Date.now() + deadlineHorizonMs + 5_000,
        percentile: (samples, p) => Effect.runSync(percentileMsEffect(samples, p)),
      });
      deadlineLateness = {
        p50: pump.p50,
        p99: pump.p99,
        n: pump.n,
        fired: pump.fired,
        maxLatenessMs: pump.maxLatenessMs,
      };
    }

    // --- Wake protocol ---
    const fromDisk =
      indexSampleIds.length >= Math.min(wakeSampleSize, 1)
        ? { sampleIds: indexSampleIds, seen: schedule.size() }
        : sampleIdsFromBagDir(bagDir, Math.max(wakeSampleSize, wakeWarmupCount, 1));
    const timedIds = pickSampleIds(fromDisk.sampleIds, wakeSampleSize);
    const warmupIds = pickSampleIds(
      fromDisk.sampleIds,
      Math.min(wakeWarmupCount, fromDisk.sampleIds.length)
    );
    const gcRecorder = yield* createGcRecorderEffect();

    if (warmupIds.length > 0) {
      yield* Effect.promise(() => sampleWakeMs(bags, warmupIds, null));
    }

    const wakeByOrder: WakeOrderResult[] = [];
    let coldEviction = "skipped";
    const timedPaths = timedIds.map((id) => bagPathFor(bagDir, id));
    const runWarm = async () => sampleWakeMs(bags, timedIds, gcRecorder);
    const runCold = async () => {
      if (options.skipCold) {
        return {
          samplesMs: [] as number[],
          gc: { count: 0, totalMs: 0, maxMs: 0 },
          eviction: "skipped",
        };
      }
      const evict = await Effect.runPromise(evictBagPageCacheEffect(bagDir, timedPaths));
      const eviction = `${evict.method}: ${evict.detail}`;
      if (!evict.ok) {
        return { samplesMs: [] as number[], gc: { count: 0, totalMs: 0, maxMs: 0 }, eviction };
      }
      const result = await sampleWakeMs(bags, timedIds, gcRecorder);
      return { ...result, eviction };
    };

    const orders: WakeOrderId[] = ["warm_then_cold", "cold_then_warm"];
    for (let rep = 0; rep < wakeOrderRepetitions; rep++) {
      for (const order of orders) {
        if (order === "warm_then_cold") {
          yield* Effect.promise(() => sampleWakeMs(bags, timedIds, null));
          const warmRaw = yield* Effect.promise(runWarm);
          const coldRaw = yield* Effect.promise(runCold);
          coldEviction = coldRaw.eviction;
          wakeByOrder.push({
            order,
            repetition: rep,
            warm: yield* Effect.promise(() => latencyFromSamples(warmRaw.samplesMs)),
            cold: yield* Effect.promise(() => latencyFromSamples(coldRaw.samplesMs)),
            gcWarm: warmRaw.gc,
            gcCold: coldRaw.gc,
          });
        } else {
          const coldRaw = yield* Effect.promise(runCold);
          coldEviction = coldRaw.eviction;
          const warmRaw = yield* Effect.promise(runWarm);
          wakeByOrder.push({
            order,
            repetition: rep,
            warm: yield* Effect.promise(() => latencyFromSamples(warmRaw.samplesMs)),
            cold: yield* Effect.promise(() => latencyFromSamples(coldRaw.samplesMs)),
            gcWarm: warmRaw.gc,
            gcCold: coldRaw.gc,
          });
        }
      }
    }

    gcRecorder.disconnect();

    const wakeSpread = computeWakeSpread(wakeByOrder);
    const headline = pickHeadlineOrder(wakeByOrder, wakeSpread);
    const wakeHeadlineOrder = headline.order;
    const wakePooled = {
      warm: poolLatencies(wakeByOrder.map((o) => o.warm)),
      cold: poolLatencies(wakeByOrder.map((o) => o.cold)),
      coldFasterThanWarmP99: wakeByOrder.some(
        (o) => o.cold.n > 0 && o.warm.n > 0 && o.cold.p99 < o.warm.p99
      ),
    };

    // Cold board columns: median across headline-order reps (not a single noisy max).
    const headlineSpread = wakeSpread.find((s) => s.order === wakeHeadlineOrder);
    const coldBoard = {
      p50: headline.cold.p50,
      p99: headlineSpread?.coldP99Median ?? headline.cold.p99,
    };
    const warmBoard = { p50: headline.warm.p50, p99: headline.warm.p99 };

    let restartSurvival = false;
    const restartProbe = timedIds[0] ?? fromDisk.sampleIds[0];
    if (!options.skipRestart && restartProbe) {
      const result = yield* Effect.promise(() =>
        runRestartWorker({
          CLAWQL_DENSITY_BAG_DIR: bagDir,
          CLAWQL_DENSITY_RESTART_AGENT_ID: restartProbe,
        })
      );
      restartSurvival = result.ok;
    }

    const diskAvailNow =
      ramp.length > 0
        ? ramp[ramp.length - 1]!.diskAvailBytes
        : yield* readDiskAvailBytesEffect(bagDir);
    const nextParkBatch =
      rampSchedule.find((t) => t > agentsAtLimit) ??
      (continueUntilCeiling && agentsAtLimit > 0
        ? Math.min(agentsAtLimit + 500_000, agentsAtLimit * 2)
        : null);

    let classified = classifyLimit({
      rssHit,
      agentsAtLimit,
      rssKiB: atLimit.rssKiB,
      rssCeilingKiB,
      rssCeilingMiB,
      diskBytesPerAgent: last?.diskBytesPerAgent ?? 33 * 1024,
      diskAvailBytes: diskAvailNow,
      ramp,
      nextParkBatch: diskBlockedDuringPark ? (nextParkBatch ?? 1) : nextParkBatch,
      coldP99Ms: coldBoard.p99,
      wakeColdP99CeilingMs,
    });

    if (rssHit && last) {
      const overshoot = ramp.find((s) => !s.withinRssCeiling);
      classified = {
        limitResource: "rss",
        limitHit: true,
        limitReason: `total process RSS exceeded ${rssCeilingMiB} MiB when scheduling past ${agentsAtLimit} agents (last within: rss=${last.rssKiB} KiB at ${agentsAtLimit}; overshoot rss=${overshoot?.rssKiB ?? atLimit.rssKiB} at ${overshoot?.agents ?? "n/a"}; wake-deadline schedule retained)`,
        agentsAtLimit,
      };
    }

    if (diskBlockedDuringPark && classified.limitResource === "none") {
      classified = {
        limitResource: "disk",
        limitHit: true,
        limitReason: `disk exhausted first at ${agentsAtLimit} agents (${diskBlockDetail})`,
        agentsAtLimit,
      };
    }

    if (!restartSurvival && options.skipRestart !== true && restartProbe) {
      classified = {
        ...classified,
        limitReason: `${classified.limitReason}; restart failed`,
      };
    }

    const limitResource = classified.limitResource;
    const limitHit = classified.limitHit;
    const limitReason = classified.limitReason;
    agentsAtLimit = classified.agentsAtLimit;
    const ceilingHit = limitHit;

    const deadlineScheduleRetainedAtLimit =
      schedule.size() > 0 && schedule.size() === agentsAtLimit && agentsAtLimit > 0;

    const boardRssKiB = rssHit && last?.withinRssCeiling ? last.rssKiB : atLimit.rssKiB;
    const boardHeapKiB =
      rssHit && last?.withinRssCeiling ? last.heapUsedKiBAfterGc : atLimit.heapUsedKiB;

    const residentAccounting: ResidentAccounting = {
      totalRssKiBPerAgent: Number((boardRssKiB / Math.max(1, agentsAtLimit)).toFixed(4)),
      heapUsedKiBPerAgentAfterGc: Number((boardHeapKiB / Math.max(1, agentsAtLimit)).toFixed(4)),
      rssDeltaKiBPerAgent: Number(
        (Math.max(0, boardRssKiB - baseline.rssKiB) / Math.max(1, agentsAtLimit)).toFixed(4)
      ),
      retainedInProcess:
        "Wake-deadline min-heap (agentId + deadlineMs) for every counted agent — approval expiry / reminder schedule. Bag path derived from agentId (FS is the id index). Id/path Maps alone are not the capacity story; once both systems trim locator overhead, capacity is disk-bound and bag size decides.",
      deadlineScheduleEntries: schedule.size(),
      scheduleShape: "deadline_min_heap",
      estimatedScheduleBytesPerAgent: 21 + 8 + 48,
    };

    const boardColumns: BoardColumns = {
      agentsAtLimit,
      limitResource,
      residentKiBPerAgent: residentAccounting.totalRssKiBPerAgent,
      pageCacheKiBPerAgent:
        pageCacheKiBPerAgent !== null ? Number(pageCacheKiBPerAgent.toFixed(4)) : null,
      diskBytesPerAgent: Number((last?.diskBytesPerAgent ?? 0).toFixed(1)),
      wakeWarmMs: warmBoard,
      wakeColdMs: coldBoard,
      deadlineLatenessMs: deadlineLateness
        ? { p50: deadlineLateness.p50, p99: deadlineLateness.p99 }
        : null,
      restartSurvival,
    };

    const coldSpreadNote = headlineSpread
      ? `cold p99 median ${headlineSpread.coldP99Median.toFixed(3)} ms (range ${headlineSpread.coldP99Min.toFixed(3)}–${headlineSpread.coldP99Max.toFixed(3)}; do not cross-compare cold until shared-host)`
      : "cold spread unmeasured";

    const clawqlStatus =
      limitHit && deadlineScheduleRetainedAtLimit ? "measured" : "methodology_pending";
    const clawqlRow: DensitySystemRow = {
      systemId: "clawql-typescript",
      status: clawqlStatus,
      hostLabel,
      honesty:
        limitHit && deadlineScheduleRetainedAtLimit
          ? `ClawQL TypeScript fair-v2 bags with **wake-deadline schedule retained** (${schedule.size()} = agentsAtLimit). Limit = first resource exhausted (**${limitResource}** at ${agentsAtLimit}). Deadline lateness p99=${deadlineLateness?.p99 ?? "n/a"} ms (${deadlineLateness?.fired ?? 0} fires). ${coldSpreadNote}. Warm p99=${warmBoard.p99} ms. Trim of id/path records likely makes both systems disk-bound (bag size ~30 vs ~32.8 KiB); deadline state is the real resident. Provisional vs Ontologiql until shared-host + Ontologiql deadline remeasure. No win copy.`
          : !deadlineScheduleRetainedAtLimit
            ? `ClawQL TypeScript — **methodology_pending**: deadline schedule not retained for every counted agent (schedule=${schedule.size()}, agentsAtLimit=${agentsAtLimit}).`
            : "ClawQL TypeScript — agents-at-limit unknown (no resource exhausted; deadline schedule retained). No win copy.",
      boardColumns,
      activeDensityLab: null,
    };

    const pendingPeers: DensitySystemRow[] = [
      {
        systemId: "golem",
        status: "pending_invite",
        hostLabel: "stable-host (same host TBD)",
        honesty: "Invite maintainers before publishing a Golem comparison row (fair-v2 deadlines).",
        boardColumns: null,
        activeDensityLab: null,
      },
      {
        systemId: "infinity",
        status: "pending_invite",
        hostLabel: "stable-host (same host TBD)",
        honesty:
          "Invite maintainers before publishing an Infinity comparison row (fair-v2 deadlines).",
        boardColumns: null,
        activeDensityLab: null,
      },
    ];

    const evidence: EvidenceFair = {
      kind: FAIR_CONTRACT_ID,
      measuredAt: new Date().toISOString(),
      contract: {
        agent: {
          turns: 20,
          turnPairBytesTarget: "~1–2 KiB text each turn pair",
          pendingToolBytesTarget: "~0.5 KiB JSON",
          park: "Waiting on that tool (idle durable)",
          offload: "Allowed; report residence (RSS / page cache / disk / object store)",
          wakeDeadline: "Randomly spread wakeDeadlineAt; system must fire on time (lateness p99)",
        },
        columns: [
          "agentsAtLimit",
          "limitResource",
          "residentKiBPerAgent",
          "pageCacheKiBPerAgent",
          "diskBytesPerAgent",
          "wakeWarmMs.p50/p99",
          "wakeColdMs.p50/p99 (quote median+range; no cross-system cold until shared-host)",
          "deadlineLatenessMs.p50/p99",
          "restartSurvival",
        ],
        memoryFraming:
          "Retained at limit = wake-deadline schedule (not id→path Map). Path is derived; FS is the id index. Id/path trim on both sides likely makes capacity disk-bound — bag size decides. Deadline lateness is the approval-relevant accuracy column. Cold wake: report median+range across order reps; do not read cross-system cold gaps until shared-host.",
        publicClaimScope:
          "Parked durable agents only. Do not quote activeDensityLab or Ready RSS boards as this claim.",
        definitions: {
          rssCeiling: "total_process_rss",
          agentsAtLimit: "first_resource_exhausted",
          retainedAtLimit: "wake_deadline_schedule",
        },
      },
      host: {
        label: hostLabel,
        hostname: host.hostname,
        platform: host.platform,
        arch: host.arch,
        nodeVersion: host.nodeVersion,
        cpus: host.cpus,
        memTotalKiB,
        rssCeilingMiB,
      },
      rows: [ONTOLOGIQL_PUBLISHABLE_ROW, clawqlRow, ...pendingPeers],
      clawqlRun: {
        bagDir,
        ramp,
        wakeSampleSize,
        wakeWarmupCount: warmupIds.length,
        wakeOrderRepetitions,
        deadlineHorizonMs,
        deadlineMaxFires,
        coldEviction,
        limitReason,
        limitHit,
        limitResource,
        rssCeilingDefinition: "total_process_rss",
        baseline,
        atLimit,
        residentAccounting,
        deadlineScheduleRetainedAtLimit,
        deadlineLateness,
        wakeByOrder,
        wakeSpread,
        wakeHeadlineOrder,
        wakePooled,
        exposeGc,
        ceilingHit,
      },
    };

    if (schedule.size() < 0) throw new Error("unreachable");
    return evidence;
  });
}

export function writeEvidenceFairEffect(
  evidence: EvidenceFair,
  outPath: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return outPath;
  });
}

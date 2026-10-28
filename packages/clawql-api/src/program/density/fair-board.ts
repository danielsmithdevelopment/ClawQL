/**
 * Fair parked-agent density board for ClawQL TypeScript.
 *
 * Methodology (v3 — first-resource limit + wake-order spread):
 * - Ceiling / agents-at-limit = **first resource exhausted** (disk | rss | latency).
 * - Resident board column = total process RSS / N (matches Ontologiql).
 * - Wake protocol: JIT warmup → alternate warm_then_cold / cold_then_warm
 *   for several repetitions; report cold/warm p99 spread; headline = slower
 *   cold order (conservative).
 * - In-process retention: id-index entry only; Ontologiql's higher resident/agent
 *   is a trim candidate (ID + bag locator), not a Rust-vs-TS memory law.
 *
 * Active-density lab pulse is out of scope for the public parked claim.
 */

import { fork, spawnSync } from "node:child_process";
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
import { buildFairParkedAgentEffect } from "./fair-agent.js";
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
  /** After the schedule, keep doubling until a resource limit is hit (default true). */
  readonly continueUntilCeiling?: boolean;
  readonly wakeSampleSize?: number;
  /** Untimed wakes before either timed order (JIT + path warmup). */
  readonly wakeWarmupCount?: number;
  /**
   * How many times to alternate warm_then_cold / cold_then_warm after warmup.
   * Spread across repetitions is reported in clawqlRun.wakeSpread.
   */
  readonly wakeOrderRepetitions?: number;
  /** Optional cold-wake p99 ceiling (ms). When set, exceeding it is a latency limit. */
  readonly wakeColdP99CeilingMs?: number;
  readonly hostLabel?: string;
  /** Skip cold eviction (CI smoke). */
  readonly skipCold?: boolean;
  /** Skip process-restart arm (unit tests). */
  readonly skipRestart?: boolean;
  /**
   * Reuse existing bags in bagDir (do not clear). `resumeFromAgents` is the
   * next agent index to park (usually = existing bag count). Wake samples are
   * drawn from the directory without loading every id into the heap.
   */
  readonly reuseBags?: boolean;
  readonly resumeFromAgents?: number;
};

/** Ramp past 200k so a total-RSS 512 MiB ceiling can actually be found. */
const DEFAULT_RAMP: readonly number[] = [
  100, 500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 300_000, 400_000,
  500_000, 750_000, 1_000_000,
];

/**
 * Ontologiql public claim (publishable) — mirrored for the comparison table.
 * Ceiling definition: total process RSS ≤ 512 MiB (rss is the binding resource).
 */
export const ONTOLOGIQL_PUBLISHABLE_ROW: DensitySystemRow = {
  systemId: "ontologiql-rust",
  status: "publishable",
  hostLabel: "stable-host (Ontologiql published)",
  honesty:
    "Ontologiql Rust fair row is publishable on the stable host. Numbers from the public claim (200k agents @ ≤512 MiB **total** process RSS, ~30 KiB disk/agent, warm wake p99 < 35 µs, cold wake p99 < 0.6 ms, restart survival). ~2 KiB resident/agent is a trim candidate (parked agent needs little more than id + bag locator) — not a Rust memory law. Full evidence-fair.json lives with Ontologiql — this mirror is not a ClawQL re-measurement.",
  boardColumns: {
    agentsAtLimit: 200_000,
    limitResource: "rss",
    residentKiBPerAgent: Number(((512 * 1024) / 200_000).toFixed(3)),
    pageCacheKiBPerAgent: null,
    diskBytesPerAgent: 30 * 1024,
    wakeWarmMs: { p50: 0.000035, p99: 0.000035 },
    wakeColdMs: { p50: 0.6, p99: 0.6 },
    restartSurvival: true,
  },
  activeDensityLab: null,
};

/**
 * Fast ramp park: sync write into bagDir (same on-disk shape as ParkedBagApi.park).
 * Keeps Effect park/wake for wake + restart paths; avoids per-agent Promise churn.
 */
function parkUpTo(bags: ParkedBagApi, fromExclusive: number, toInclusive: number): string[] {
  mkdirSync(bags.bagDir, { recursive: true, mode: 0o700 });
  const ids: string[] = [];
  for (let i = fromExclusive; i < toInclusive; i++) {
    const agent = Effect.runSync(buildFairParkedAgentEffect(i));
    const path = join(bags.bagDir, `${agent.agentId}.json`);
    const tmp = `${path}.tmp`;
    const body = `${JSON.stringify(agent)}\n`;
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, path);
    ids.push(agent.agentId);
  }
  return ids;
}

function pickSampleIds(ids: readonly string[], sampleSize: number): string[] {
  const n = Math.min(sampleSize, ids.length);
  if (n <= 0) return [];
  const out: string[] = [];
  for (let s = 0; s < n; s++) {
    out.push(ids[Math.floor((s * ids.length) / n)]!);
  }
  return out;
}

/**
 * Sample bag ids via `find`/`awk` — do **not** `readdirSync` multi-million
 * directories (dentry fault-in alone can push RSS over the fair ceiling).
 */
function sampleIdsFromBagDir(bagDir: string, sampleSize: number): {
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
  if (res.status !== 0) {
    return { sampleIds: [], seen: 0 };
  }
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
  const gcSummary = gc?.stop() ?? { count: 0, totalMs: 0, maxMs: 0 };
  return { samplesMs: samples, gc: gcSummary };
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

/**
 * Pick the slower cold order for conservative headline columns.
 * Rank by coldP99Max (worst observed cold), tie-break by coldP99Median.
 * Board columns use the repetition that hit that max cold p99.
 */
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

/** Estimate RSS KiB growth per additional agent from the last two ramp steps. */
function rssGrowthPerAgentKiB(ramp: readonly FairRampStep[]): number {
  if (ramp.length < 2) return 0;
  const a = ramp[ramp.length - 2]!;
  const b = ramp[ramp.length - 1]!;
  const dAgents = b.agents - a.agents;
  if (dAgents <= 0) return 0;
  return Math.max(0, (b.rssKiB - a.rssKiB) / dAgents);
}

/**
 * Classify the binding limit: first of disk | rss | latency that runs out.
 * Disk binds when remaining disk agents < remaining RSS-headroom agents (or
 * the next park batch cannot fit). Flat RSS (reuse / no id index) ⇒ disk first.
 */
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
    args.diskAvailBytes !== null ? Math.floor(args.diskAvailBytes / bytesPer) : Number.POSITIVE_INFINITY;
  const growth = rssGrowthPerAgentKiB(args.ramp);
  const rssHeadroomKiB = Math.max(0, args.rssCeilingKiB - args.rssKiB);
  const roomInRss =
    growth > 1e-6 ? Math.floor(rssHeadroomKiB / growth) : Number.POSITIVE_INFINITY;

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
      limitReason: `disk exhausted first at ${args.agentsAtLimit} agents (avail=${args.diskAvailBytes} B ≈ ${roomOnDisk} more agents @ ${bytesPer} B/agent; RSS headroom ≈ ${roomInRss === Number.POSITIVE_INFINITY ? "∞" : roomInRss} agents at measured growth ${growth.toFixed(6)} KiB/agent; total RSS ${args.rssKiB} KiB < ${args.rssCeilingMiB} MiB ceiling)`,
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
    const allIds: string[] = [];
    const ramp: FairRampStep[] = [];
    let agentsAtLimit = 0;
    let rssHit = false;
    let diskBlockedDuringPark = false;
    let diskBlockDetail = "";

    let prev = 0;
    if (reuseBags) {
      const resumeFrom = options.resumeFromAgents ?? 0;
      prev = resumeFrom;
      agentsAtLimit = resumeFrom;
      if (resumeFrom > 0) {
        const heap = yield* readHeapSnapshotEffect();
        const disk = yield* diskBytesFast(bags);
        const diskAvailBytes = yield* readDiskAvailBytesEffect(bagDir);
        const rssDelta = Math.max(0, heap.rssKiB - baseline.rssKiB);
        ramp.push({
          agents: resumeFrom,
          rssKiB: heap.rssKiB,
          residentKiBPerAgent: heap.rssKiB / resumeFrom,
          rssDeltaKiBPerAgent: rssDelta / resumeFrom,
          heapUsedKiBAfterGc: heap.heapUsedKiB,
          heapUsedKiBPerAgentAfterGc: heap.heapUsedKiB / resumeFrom,
          diskBytesTotal: disk,
          diskBytesPerAgent: disk / resumeFrom,
          diskAvailBytes,
          pageCacheKiBPerAgent: null,
          withinRssCeiling: heap.rssKiB <= rssCeilingKiB,
        });
        if (heap.rssKiB > rssCeilingKiB) {
          rssHit = true;
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
        batch = parkUpTo(bags, prev, target);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/ENOSPC|no space/i.test(msg)) {
          diskBlockedDuringPark = true;
          diskBlockDetail = `ENOSPC while parking toward ${target}: ${msg}`;
          break;
        }
        throw err;
      }
      for (let i = 0; i < batch.length; i++) allIds.push(batch[i]!);
      prev = target;

      const heap = yield* readHeapSnapshotEffect();
      const disk = yield* diskBytesFast(bags);
      const diskAvailBytes = yield* readDiskAvailBytesEffect(bagDir);
      const within = heap.rssKiB <= rssCeilingKiB;
      const rssDelta = Math.max(0, heap.rssKiB - baseline.rssKiB);
      const step: FairRampStep = {
        agents: target,
        rssKiB: heap.rssKiB,
        residentKiBPerAgent: heap.rssKiB / target,
        rssDeltaKiBPerAgent: rssDelta / target,
        heapUsedKiBAfterGc: heap.heapUsedKiB,
        heapUsedKiBPerAgentAfterGc: heap.heapUsedKiB / target,
        diskBytesTotal: disk,
        diskBytesPerAgent: disk / target,
        diskAvailBytes,
        pageCacheKiBPerAgent: null,
        withinRssCeiling: within,
      };
      ramp.push(step);
      agentsAtLimit = target;

      if (!within) {
        rssHit = true;
        break;
      }
    }

    const atLimit = yield* readHeapSnapshotEffect();
    const last = ramp[ramp.length - 1]!;
    const pageCacheKiB = yield* measureBagPageCacheKiBEffect(bagDir, 2_000, agentsAtLimit);
    const pageCacheKiBPerAgent =
      pageCacheKiB !== null && agentsAtLimit > 0 ? pageCacheKiB / agentsAtLimit : null;
    if (ramp.length > 0) {
      ramp[ramp.length - 1] = {
        ...last,
        pageCacheKiBPerAgent,
      };
    }

    // --- Wake protocol: warmup, then alternate orders for N repetitions ---
    const fromDisk = sampleIdsFromBagDir(
      bagDir,
      Math.max(wakeSampleSize, wakeWarmupCount, 1)
    );
    const timedIds =
      fromDisk.sampleIds.length >= Math.min(wakeSampleSize, 1)
        ? pickSampleIds(fromDisk.sampleIds, wakeSampleSize)
        : pickSampleIds(allIds, wakeSampleSize);
    const warmupIds =
      fromDisk.sampleIds.length > 0
        ? pickSampleIds(fromDisk.sampleIds, Math.min(wakeWarmupCount, fromDisk.sampleIds.length))
        : pickSampleIds(allIds, Math.min(wakeWarmupCount, allIds.length));
    const gcRecorder = yield* createGcRecorderEffect();

    if (warmupIds.length > 0) {
      yield* Effect.promise(() => sampleWakeMs(bags, warmupIds, null));
    }

    const wakeByOrder: WakeOrderResult[] = [];
    let coldEviction = "skipped";

    const timedPaths = timedIds.map((id) => join(bagDir, `${id}.json`));
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

    const sampleId = allIds[0] ?? "";
    const estimatedIdIndexBytesPerAgent =
      Buffer.byteLength(sampleId, "utf8") + 32 /* string header */ + 8; /* array slot */

    const residentAccounting: ResidentAccounting = {
      totalRssKiBPerAgent: Number((atLimit.rssKiB / Math.max(1, agentsAtLimit)).toFixed(4)),
      heapUsedKiBPerAgentAfterGc: Number(
        (atLimit.heapUsedKiB / Math.max(1, agentsAtLimit)).toFixed(4)
      ),
      rssDeltaKiBPerAgent: Number(
        (Math.max(0, atLimit.rssKiB - baseline.rssKiB) / Math.max(1, agentsAtLimit)).toFixed(4)
      ),
      retainedInProcess: reuseBags
        ? "reuse/measure run: wakes sampled via find(1) without retaining N ids in-process; bag bodies on disk only. Fresh park ramps retain agentId strings in allIds (id index) — ~130 B/agent class with baseline, far below Ontologiql's ~2 KiB/agent struct (trim candidate: id + bag locator)."
        : "agentId string in the in-process id index (allIds) only; FairParkedAgent body is offloaded to disk JSON after park. Ontologiql's higher resident/agent is likely a larger per-agent struct — optimization target, not a Rust-vs-TS law.",
      estimatedIdIndexBytesPerAgent,
    };

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
      (continueUntilCeiling && agentsAtLimit > 0 ? Math.min(agentsAtLimit + 500_000, agentsAtLimit * 2) : null);

    let classified = classifyLimit({
      rssHit,
      agentsAtLimit,
      rssKiB: atLimit.rssKiB,
      rssCeilingKiB,
      rssCeilingMiB,
      diskBytesPerAgent: last?.diskBytesPerAgent ?? 33 * 1024,
      diskAvailBytes: diskAvailNow,
      ramp,
      nextParkBatch: diskBlockedDuringPark ? nextParkBatch ?? 1 : nextParkBatch,
      coldP99Ms: headline.cold.n > 0 ? headline.cold.p99 : null,
      wakeColdP99CeilingMs,
    });

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
    const ceilingHit = limitHit; // deprecated alias

    const boardColumns: BoardColumns = {
      agentsAtLimit,
      limitResource,
      residentKiBPerAgent: residentAccounting.totalRssKiBPerAgent,
      pageCacheKiBPerAgent:
        pageCacheKiBPerAgent !== null ? Number(pageCacheKiBPerAgent.toFixed(4)) : null,
      diskBytesPerAgent: Number((last?.diskBytesPerAgent ?? 0).toFixed(1)),
      wakeWarmMs: { p50: headline.warm.p50, p99: headline.warm.p99 },
      wakeColdMs: { p50: headline.cold.p50, p99: headline.cold.p99 },
      restartSurvival,
    };

    const clawqlStatus = limitHit ? "measured" : "methodology_pending";
    const clawqlRow: DensitySystemRow = {
      systemId: "clawql-typescript",
      status: clawqlStatus,
      hostLabel,
      honesty: limitHit
        ? `ClawQL TypeScript fair parked-agent bags (file-backed JSON, offloaded). Agents-at-limit = first resource exhausted (**${limitResource}** at ${agentsAtLimit}). Wake protocol: JIT warmup + ${wakeOrderRepetitions}× alternation of warm_then_cold / cold_then_warm; headline = slower cold order (${wakeHeadlineOrder}). Resident board column = total RSS/N; in-process retention is an id-index entry (~130 B/agent class with baseline on live park) — Ontologiql's ~2 KiB/agent is a trim opportunity (id + bag locator), not a Rust loss. Measured advantages to quote later: wake speed and baseline process RSS — not "fits more agents." No cross-system win until shared-host remeasure with Golem/Infinity.`
        : "ClawQL TypeScript fair parked-agent bags — **agents-at-limit still unknown**: no disk, RSS, or latency resource exhausted. Do not quote agentsAtLimit as a real ceiling. Wake spread and resident accounting are recorded. No cross-system win / no 'fits more agents' copy.",
      boardColumns,
      activeDensityLab: null,
    };

    const pendingPeers: DensitySystemRow[] = [
      {
        systemId: "golem",
        status: "pending_invite",
        hostLabel: "stable-host (same host TBD)",
        honesty: "Invite maintainers before publishing a Golem comparison row.",
        boardColumns: null,
        activeDensityLab: null,
      },
      {
        systemId: "infinity",
        status: "pending_invite",
        hostLabel: "stable-host (same host TBD)",
        honesty: "Invite maintainers before publishing an Infinity comparison row.",
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
        },
        columns: [
          "agentsAtLimit",
          "limitResource",
          "residentKiBPerAgent",
          "pageCacheKiBPerAgent",
          "diskBytesPerAgent",
          "wakeWarmMs.p50/p99",
          "wakeColdMs.p50/p99",
          "restartSurvival",
        ],
        memoryFraming:
          "Resident (total process RSS / N) is the floor; page cache is reclaimable; heapUsed-after-GC is the GC-runtime check. TS retains an id-index entry per parked agent; Ontologiql's larger per-agent struct is a trim candidate. Quote cold wake vs warm only after warmup + multi-rep order alternation (headline = slower cold order). Do not write 'fits more agents' — Ontologiql's measured edges here are wake speed and baseline process RSS.",
        publicClaimScope:
          "Parked durable agents only. Do not quote activeDensityLab or Ready RSS boards as this claim.",
        definitions: {
          rssCeiling: "total_process_rss",
          agentsAtLimit: "first_resource_exhausted",
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
        coldEviction,
        limitReason,
        limitHit,
        limitResource,
        rssCeilingDefinition: "total_process_rss",
        baseline,
        atLimit,
        residentAccounting,
        wakeByOrder,
        wakeSpread,
        wakeHeadlineOrder,
        wakePooled,
        exposeGc,
        ceilingHit,
      },
    };

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

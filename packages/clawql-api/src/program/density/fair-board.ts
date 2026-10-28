/**
 * Fair parked-agent density board for ClawQL TypeScript.
 *
 * Methodology (v2 — fixes wake-order / ceiling / resident accounting):
 * - Ceiling = **total process RSS** (matches Ontologiql), not RSS-delta.
 * - Ramp until total RSS exceeds the ceiling (agents-at-limit is that N).
 * - Wake protocol: JIT warmup → alternate warm_then_cold and cold_then_warm
 *   with GC-pause recording on each timed window.
 * - Resident: board column uses total RSS/N; also report heapUsed after forced
 *   GC and document in-process retention (id index only).
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
  readHeapSnapshotEffect,
  readMemTotalKiBEffect,
  readProcessRssEffect,
  type GcRecorder,
} from "./host-metrics.js";
import type {
  BoardColumns,
  EvidenceFair,
  FairRampStep,
  DensitySystemRow,
  WakeLatency,
  WakeOrderId,
  WakeOrderResult,
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
  /** After the schedule, keep doubling until the ceiling is hit (default true). */
  readonly continueUntilCeiling?: boolean;
  readonly wakeSampleSize?: number;
  /** Untimed wakes before either timed order (JIT + path warmup). */
  readonly wakeWarmupCount?: number;
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
 * Ceiling definition: total process RSS ≤ 512 MiB.
 */
export const ONTOLOGIQL_PUBLISHABLE_ROW: DensitySystemRow = {
  systemId: "ontologiql-rust",
  status: "publishable",
  hostLabel: "stable-host (Ontologiql published)",
  honesty:
    "Ontologiql Rust fair row is publishable on the stable host. Numbers from the public claim (200k agents @ ≤512 MiB **total** process RSS, ~30 KiB disk/agent, warm wake p99 < 35 µs, cold wake p99 < 0.6 ms, restart survival). Full evidence-fair.json lives with Ontologiql — this mirror is not a ClawQL re-measurement.",
  boardColumns: {
    agentsAtLimit: 200_000,
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
  // Pool by concatenating is ideal; here we only have percentiles — report the
  // max p99 across orders (conservative) and mean p50.
  if (parts.length === 0) return { p50: 0, p99: 0, n: 0 };
  const n = parts.reduce((a, p) => a + p.n, 0);
  const p50 = parts.reduce((a, p) => a + p.p50 * p.n, 0) / Math.max(1, n);
  const p99 = Math.max(...parts.map((p) => p.p99));
  return { p50: Number(p50.toFixed(6)), p99: Number(p99.toFixed(6)), n };
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
  // Seed geometric growth after the last scheduled point; board stops when RSS hits.
  let last = targets[targets.length - 1]!;
  for (let i = 0; i < 24; i++) {
    const next = Math.min(last * 2, last + 500_000);
    if (next <= last) break;
    targets.push(next);
    last = next;
  }
  return targets;
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
    let limitReason = `completed ramp through ${rampSchedule[rampSchedule.length - 1]} without hitting ${rssCeilingMiB} MiB total RSS`;
    let agentsAtLimit = 0;
    let ceilingHit = false;

    let prev = 0;
    if (reuseBags) {
      const resumeFrom = options.resumeFromAgents ?? 0;
      prev = resumeFrom;
      agentsAtLimit = resumeFrom;
      // Do not seed millions of stub ids — that artificially blows RSS and also
      // breaks restart (stubs are not on disk). Id-index cost is measured on
      // fresh ramps that append real ids during parkUpTo.
      if (resumeFrom > 0) {
        const heap = yield* readHeapSnapshotEffect();
        const disk = yield* diskBytesFast(bags);
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
          pageCacheKiBPerAgent: null,
          withinRssCeiling: heap.rssKiB <= rssCeilingKiB,
        });
        if (heap.rssKiB > rssCeilingKiB) {
          ceilingHit = true;
          limitReason = `reused bags already over ${rssCeilingMiB} MiB total RSS at ${resumeFrom} agents (rss=${heap.rssKiB} KiB)`;
        } else {
          limitReason = `reused ${resumeFrom} bags under ${rssCeilingMiB} MiB total RSS; disk headroom on this host prevents further park before the RSS ceiling (agents-at-limit for 512 MiB total RSS still unknown)`;
        }
      }
    }

    for (const target of rampSchedule) {
      if (ceilingHit) break;
      if (target <= prev) continue;
      const batch = parkUpTo(bags, prev, target);
      // Do not `push(...batch)` — large batches exceed the call-stack argument limit.
      for (let i = 0; i < batch.length; i++) allIds.push(batch[i]!);
      prev = target;

      const heap = yield* readHeapSnapshotEffect();
      const disk = yield* diskBytesFast(bags);
      // Page-cache sampling is expensive at multi-million scale — measure once at limit.
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
        pageCacheKiBPerAgent: null,
        withinRssCeiling: within,
      };
      ramp.push(step);
      agentsAtLimit = target;

      if (!within) {
        ceilingHit = true;
        limitReason = `total process RSS exceeded ${rssCeilingMiB} MiB at ${target} agents (rss=${heap.rssKiB} KiB, ceiling=${rssCeilingKiB} KiB)`;
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

    // --- Wake protocol: warmup, then alternate orders ---
    // Prefer on-disk samples so reused stub ids are never woken.
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

    // Untimed warmup: pay JIT / optimize wake path before either timed order.
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
      // Evict only the timed sample — measures cold wake of those agents without
      // advising millions of unrelated bag files.
      const evict = await Effect.runPromise(evictBagPageCacheEffect(bagDir, timedPaths));
      const eviction = `${evict.method}: ${evict.detail}`;
      if (!evict.ok) {
        return { samplesMs: [] as number[], gc: { count: 0, totalMs: 0, maxMs: 0 }, eviction };
      }
      const result = await sampleWakeMs(bags, timedIds, gcRecorder);
      return { ...result, eviction };
    };

    const orders: WakeOrderId[] = ["warm_then_cold", "cold_then_warm"];
    for (const order of orders) {
      if (order === "warm_then_cold") {
        // Ensure page cache is hot for the timed sample (warmup may not cover timedIds).
        yield* Effect.promise(() => sampleWakeMs(bags, timedIds, null));
        const warmRaw = yield* Effect.promise(runWarm);
        const coldRaw = yield* Effect.promise(runCold);
        coldEviction = coldRaw.eviction;
        wakeByOrder.push({
          order,
          warm: yield* Effect.promise(() => latencyFromSamples(warmRaw.samplesMs)),
          cold: yield* Effect.promise(() => latencyFromSamples(coldRaw.samplesMs)),
          gcWarm: warmRaw.gc,
          gcCold: coldRaw.gc,
        });
      } else {
        // cold_then_warm: start from a cold cache; warm follows on the same ids.
        const coldRaw = yield* Effect.promise(runCold);
        coldEviction = coldRaw.eviction;
        const warmRaw = yield* Effect.promise(runWarm);
        wakeByOrder.push({
          order,
          warm: yield* Effect.promise(() => latencyFromSamples(warmRaw.samplesMs)),
          cold: yield* Effect.promise(() => latencyFromSamples(coldRaw.samplesMs)),
          gcWarm: warmRaw.gc,
          gcCold: coldRaw.gc,
        });
      }
    }

    gcRecorder.disconnect();

    const wakePooled = {
      warm: poolLatencies(wakeByOrder.map((o) => o.warm)),
      cold: poolLatencies(wakeByOrder.map((o) => o.cold)),
      coldFasterThanWarmP99: false,
    };
    // Headline board columns use warm_then_cold (post-warmup canonical order).
    const headline =
      wakeByOrder.find((o) => o.order === "warm_then_cold") ?? wakeByOrder[0]!;
    wakePooled.coldFasterThanWarmP99 = wakeByOrder.some(
      (o) => o.cold.n > 0 && o.warm.n > 0 && o.cold.p99 < o.warm.p99
    );

    // Id-index byte estimate: UTF-8 id length + rough V8 string/array slot overhead.
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
        ? "reuse/measure run: wakes sampled via find(1) without retaining N ids in-process; bag bodies on disk only. Fresh park ramps retain agentId strings in allIds (id index)."
        : "agentId string in the in-process id index (allIds) only; FairParkedAgent body is offloaded to disk JSON after park",
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
      if (!result.ok) limitReason = `${limitReason}; restart: ${result.detail}`;
    }

    const boardColumns: BoardColumns = {
      agentsAtLimit,
      residentKiBPerAgent: residentAccounting.totalRssKiBPerAgent,
      pageCacheKiBPerAgent:
        pageCacheKiBPerAgent !== null ? Number(pageCacheKiBPerAgent.toFixed(4)) : null,
      diskBytesPerAgent: Number(last.diskBytesPerAgent.toFixed(1)),
      wakeWarmMs: { p50: headline.warm.p50, p99: headline.warm.p99 },
      wakeColdMs: { p50: headline.cold.p50, p99: headline.cold.p99 },
      restartSurvival,
    };

    const clawqlStatus = ceilingHit ? "measured" : "methodology_pending";
    const clawqlRow: DensitySystemRow = {
      systemId: "clawql-typescript",
      status: clawqlStatus,
      hostLabel,
      honesty: ceilingHit
        ? "ClawQL TypeScript fair parked-agent bags (file-backed JSON, offloaded). Ceiling = total process RSS (matched to Ontologiql). Wake protocol: JIT warmup + warm_then_cold and cold_then_warm with GC pause recording. Resident board column = total RSS/N; also see heapUsed-after-GC and id-index retention. Not Ready RSS / memory-plateau. Do not claim a cross-system win; shared-host remeasure decides positioning (wake speed / baseline process RSS are the candidate Rust stories — not 'fits more agents' until both sides use the same definitions)."
        : "ClawQL TypeScript fair parked-agent bags — **agents-at-limit still unknown**: ramp finished without total process RSS exceeding the ceiling. Do not quote agentsAtLimit as a real ceiling. Wake protocol and resident accounting are recorded for methodology review. No cross-system win / no 'fits more agents' copy.",
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
          "residentKiBPerAgent",
          "pageCacheKiBPerAgent",
          "diskBytesPerAgent",
          "wakeWarmMs.p50/p99",
          "wakeColdMs.p50/p99",
          "restartSurvival",
        ],
        memoryFraming:
          "Resident (total process RSS / N) is the floor; page cache is reclaimable; heapUsed-after-GC is the GC-runtime check. Quote cold wake vs warm working set only after a warmup + both wake orders. Do not write 'fits more agents' comparison copy until shared-host remeasure.",
        publicClaimScope:
          "Parked durable agents only. Do not quote activeDensityLab or Ready RSS boards as this claim.",
        definitions: {
          rssCeiling: "total_process_rss",
          agentsAtLimit: "first_N_where_total_rss_exceeds_ceiling",
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
        coldEviction,
        limitReason,
        ceilingHit,
        rssCeilingDefinition: "total_process_rss",
        baseline,
        atLimit,
        residentAccounting,
        wakeByOrder,
        wakePooled,
        exposeGc,
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

/**
 * Fair parked-agent density board for ClawQL TypeScript.
 *
 * Ramp → boardColumns → warm/cold wake → restart survival.
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
  evictBagPageCacheEffect,
  hostIdentityEffect,
  measureBagPageCacheKiBEffect,
  percentileMsEffect,
  readMemTotalKiBEffect,
  readProcessRssEffect,
} from "./host-metrics.js";
import type { BoardColumns, EvidenceFair, FairRampStep, DensitySystemRow } from "./types.js";
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
  readonly wakeSampleSize?: number;
  readonly hostLabel?: string;
  /** Skip cold eviction (CI smoke). */
  readonly skipCold?: boolean;
  /** Skip process-restart arm (unit tests). */
  readonly skipRestart?: boolean;
};

const DEFAULT_RAMP: readonly number[] = [
  100, 500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 200_000,
];

/**
 * Ontologiql public claim (publishable) — mirrored for the comparison table.
 * Wake latencies are upper bounds from the published claim (p50 unknown → null-ish via -1 sentinel avoided; use same p99 as bound).
 */
export const ONTOLOGIQL_PUBLISHABLE_ROW: DensitySystemRow = {
  systemId: "ontologiql-rust",
  status: "publishable",
  hostLabel: "stable-host (Ontologiql published)",
  honesty:
    "Ontologiql Rust fair row is publishable on the stable host. Numbers from the public claim (200k agents @ ≤512 MiB RSS, ~30 KiB disk/agent, warm wake p99 < 35 µs, cold wake p99 < 0.6 ms, restart survival). Full evidence-fair.json lives with Ontologiql — this mirror is not a ClawQL re-measurement.",
  boardColumns: {
    agentsAtLimit: 200_000,
    // 512 MiB ceiling / 200k agents
    residentKiBPerAgent: Number(((512 * 1024) / 200_000).toFixed(3)),
    pageCacheKiBPerAgent: null,
    diskBytesPerAgent: 30 * 1024,
    // Claim states p99 bounds; p50 not published — repeat p99 as documented bound only.
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

async function sampleWakeMs(
  bags: ParkedBagApi,
  ids: readonly string[],
  sampleSize: number
): Promise<number[]> {
  const n = Math.min(sampleSize, ids.length);
  const samples: number[] = [];
  // Spread samples across the id space.
  for (let s = 0; s < n; s++) {
    const idx = Math.floor((s * ids.length) / n);
    const id = ids[idx]!;
    const t0 = process.hrtime.bigint();
    await Effect.runPromise(bags.wake(id));
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  return samples;
}

function runRestartWorker(env: Readonly<Record<string, string>>): Promise<{
  readonly ok: boolean;
  readonly detail: string;
}> {
  return new Promise((resolve) => {
    const child = fork(RESTART_WORKER, [], {
      execArgv: ["--import", "tsx"],
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

export function runFairDensityBoardEffect(
  options: FairBoardOptions = {}
): Effect.Effect<EvidenceFair> {
  return Effect.gen(function* () {
    const bagDir = options.bagDir ?? (yield* resolveBagDirEffect());
    const rssCeilingMiB = options.rssCeilingMiB ?? 512;
    const rampSchedule = options.rampSchedule ?? DEFAULT_RAMP;
    const wakeSampleSize = options.wakeSampleSize ?? 200;
    const hostLabel = options.hostLabel ?? "clawql-cloud-agent-host";
    const rssCeilingKiB = rssCeilingMiB * 1024;

    yield* clearBagDirEffect(bagDir);
    const bags = makeParkedBagApi(bagDir);
    const host = yield* hostIdentityEffect();
    const memTotalKiB = yield* readMemTotalKiBEffect();

    const baselineRss = yield* readProcessRssEffect();
    const allIds: string[] = [];
    const ramp: FairRampStep[] = [];
    let limitReason = `completed ramp through ${rampSchedule[rampSchedule.length - 1]}`;
    let agentsAtLimit = 0;

    let prev = 0;
    for (const target of rampSchedule) {
      if (target <= prev) continue;
      const batch = parkUpTo(bags, prev, target);
      allIds.push(...batch);
      prev = target;

      // Drop any accidental retention of large locals; GC hint only.
      if (global.gc) global.gc();

      const rss = yield* readProcessRssEffect();
      const disk = yield* diskBytesFast(bags);
      const pageCacheKiB = yield* measureBagPageCacheKiBEffect(bagDir);
      const within = rss.rssKiB - baselineRss.rssKiB <= rssCeilingKiB;
      // Prefer incremental RSS vs baseline empty process for per-agent resident cost.
      const incremental = Math.max(0, rss.rssKiB - baselineRss.rssKiB);
      const step: FairRampStep = {
        agents: target,
        rssKiB: rss.rssKiB,
        residentKiBPerAgent: incremental / target,
        diskBytesTotal: disk,
        diskBytesPerAgent: disk / target,
        pageCacheKiBPerAgent: pageCacheKiB !== null ? pageCacheKiB / target : null,
        withinRssCeiling: within,
      };
      ramp.push(step);
      agentsAtLimit = target;

      if (!within) {
        limitReason = `RSS delta vs baseline exceeded ${rssCeilingMiB} MiB at ${target} agents (rss=${rss.rssKiB} KiB, baseline=${baselineRss.rssKiB} KiB)`;
        break;
      }
    }

    // Warm wake: bags should still be in page cache after ramp writes + diskBytes scan.
    const warmSamples = yield* Effect.promise(() => sampleWakeMs(bags, allIds, wakeSampleSize));
    const warmP50 = yield* percentileMsEffect(warmSamples, 50);
    const warmP99 = yield* percentileMsEffect(warmSamples, 99);

    let coldP50 = Number.NaN;
    let coldP99 = Number.NaN;
    let coldEviction = "skipped";
    if (!options.skipCold) {
      const evict = yield* evictBagPageCacheEffect(bagDir);
      coldEviction = `${evict.method}: ${evict.detail}`;
      if (evict.ok) {
        const coldSamples = yield* Effect.promise(() => sampleWakeMs(bags, allIds, wakeSampleSize));
        coldP50 = yield* percentileMsEffect(coldSamples, 50);
        coldP99 = yield* percentileMsEffect(coldSamples, 99);
      } else {
        coldEviction = `failed — ${evict.detail}`;
      }
    }

    const last = ramp[ramp.length - 1]!;
    const pageCacheKiB = yield* measureBagPageCacheKiBEffect(bagDir);

    let restartSurvival = false;
    if (!options.skipRestart && allIds.length > 0) {
      const probe = allIds[Math.floor(allIds.length / 2)]!;
      const result = yield* Effect.promise(() =>
        runRestartWorker({
          CLAWQL_DENSITY_BAG_DIR: bagDir,
          CLAWQL_DENSITY_RESTART_AGENT_ID: probe,
        })
      );
      restartSurvival = result.ok;
      if (!result.ok) limitReason = `${limitReason}; restart: ${result.detail}`;
    } else if (options.skipRestart) {
      restartSurvival = false;
    }

    const boardColumns: BoardColumns = {
      agentsAtLimit,
      residentKiBPerAgent: Number(last.residentKiBPerAgent.toFixed(4)),
      pageCacheKiBPerAgent:
        pageCacheKiB !== null ? Number((pageCacheKiB / agentsAtLimit).toFixed(4)) : null,
      diskBytesPerAgent: Number(last.diskBytesPerAgent.toFixed(1)),
      wakeWarmMs: {
        p50: Number(warmP50.toFixed(6)),
        p99: Number(warmP99.toFixed(6)),
      },
      wakeColdMs: {
        p50: Number(coldP50.toFixed(6)),
        p99: Number(coldP99.toFixed(6)),
      },
      restartSurvival,
    };

    const clawqlRow: DensitySystemRow = {
      systemId: "clawql-typescript",
      status: "measured",
      hostLabel,
      honesty:
        "ClawQL TypeScript fair parked-agent bags (file-backed JSON, offloaded). Not Ready-process RSS / memory-plateau. Active-density lab pulse not measured here — do not quote as active agents. Cross-system win claims wait for Golem/Infinity rows or maintainer invites.",
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
          "Resident is the floor; page cache is reclaimable. Quote the trade-off (cold wake vs warm working set), not RSS alone.",
        publicClaimScope:
          "Parked durable agents only. Do not quote activeDensityLab or Ready RSS boards as this claim.",
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
        coldEviction,
        limitReason,
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

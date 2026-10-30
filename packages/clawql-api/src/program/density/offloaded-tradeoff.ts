/**
 * Offloaded trade-off measurement for Infinity-matched density bags.
 *
 * Quantifies costs that the resident Infinity arm does not pay:
 *   - OS page cache holding dens_*.json pages
 *   - Warm wake (bag already in page cache): read + JSON parse + restore
 *   - Cold wake (after posix_fadvise DONTNEED): same path from disk
 *
 * Present beside Infinity serverless / external-store — not against in-memory
 * agent_scale. Always publishable:false on this KVM cloud-agent host.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { makeDensityConversationRuntime } from "./density-conversation-runtime.js";
import {
  INFINITY_MATCHED_CONTRACT_ID,
  INFINITY_MATCHED_TURNS,
} from "./infinity-matched-shape.js";
import {
  evictBagPageCacheEffect,
  forceFullGcEffect,
  measureBagPageCacheKiBEffect,
  percentileMsEffect,
  readProcessRssEffect,
} from "./host-metrics.js";
import { hostDisclosureEffect, type HostDisclosure } from "./infinity-harness-v2.js";

export type WakeLatencyPair = {
  readonly p50: number;
  readonly p99: number;
  readonly n: number;
};

export type OffloadedTradeoffEvidence = {
  readonly kind: "infinity-clawql-offloaded-tradeoff-v1";
  readonly measuredAt: string;
  readonly publishable: false;
  readonly host: HostDisclosure;
  readonly contract: {
    readonly id: typeof INFINITY_MATCHED_CONTRACT_ID;
    readonly turns: number;
    readonly note: string;
  };
  readonly population: {
    readonly agentsParked: number;
    readonly wakeSampleSize: number;
    readonly wakeOrderRepetitions: number;
    readonly diskBytesPerAgent: number;
    readonly diskBytesTotal: number;
    readonly bagDir: string;
  };
  readonly pageCache: {
    readonly afterParkKiB: number | null;
    readonly afterParkKiBPerAgent: number | null;
    readonly afterColdEvictKiB: number | null;
    readonly method: string;
  };
  readonly wake: {
    readonly warmMs: WakeLatencyPair;
    readonly coldMs: WakeLatencyPair;
    readonly byOrder: readonly {
      readonly order: "warm_then_cold" | "cold_then_warm";
      readonly repetition: number;
      readonly warm: WakeLatencyPair;
      readonly cold: WakeLatencyPair;
      readonly coldEviction: string;
    }[];
    readonly coldEviction: string;
  };
  readonly rss: {
    readonly afterParkKiB: number;
    readonly idsOnlySlopeKiBPerAgent: number | null;
  };
  readonly reading: string;
};

function latencyFromSamplesEffect(samplesMs: readonly number[]): Effect.Effect<WakeLatencyPair> {
  return Effect.gen(function* () {
    const p50 = yield* percentileMsEffect(samplesMs, 50);
    const p99 = yield* percentileMsEffect(samplesMs, 99);
    return {
      p50: Number(p50.toFixed(6)),
      p99: Number(p99.toFixed(6)),
      n: samplesMs.length,
    };
  });
}

function poolLatencies(parts: readonly WakeLatencyPair[]): WakeLatencyPair {
  if (parts.length === 0) return { p50: 0, p99: 0, n: 0 };
  const n = parts.reduce((a, p) => a + p.n, 0);
  const p50 = parts.reduce((a, p) => a + p.p50 * p.n, 0) / Math.max(1, n);
  const p99 = Math.max(...parts.map((p) => p.p99));
  return { p50: Number(p50.toFixed(6)), p99: Number(p99.toFixed(6)), n };
}

/**
 * Time wake(agentId) then immediately park again so RSS stays ids-only between samples.
 */
function sampleWakeMsEffect(
  rt: ReturnType<typeof makeDensityConversationRuntime>,
  sampleIds: readonly string[]
): Effect.Effect<number[]> {
  return Effect.gen(function* () {
    const samples: number[] = [];
    for (const id of sampleIds) {
      const t0 = process.hrtime.bigint();
      yield* rt.wake(id);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
      // Re-park so the next timed wake starts from offloaded + disk bag.
      yield* rt.parkOffloaded(id);
    }
    return samples;
  });
}

export function runOffloadedTradeoffEffect(opts?: {
  readonly agentCount?: number;
  readonly wakeSampleSize?: number;
  readonly wakeOrderRepetitions?: number;
  readonly bagRoot?: string;
}): Effect.Effect<OffloadedTradeoffEvidence> {
  const agentCount = Math.max(1, opts?.agentCount ?? 500);
  const wakeSampleSize = Math.min(
    agentCount,
    Math.max(1, opts?.wakeSampleSize ?? Math.min(200, agentCount))
  );
  const wakeOrderRepetitions = Math.max(1, opts?.wakeOrderRepetitions ?? 3);
  const bagRoot = opts?.bagRoot ?? "/tmp/clawql-offloaded-tradeoff";

  return Effect.gen(function* () {
    const host = yield* hostDisclosureEffect();
    const bagDir = join(bagRoot, `dens-${Date.now()}`);
    const rt = makeDensityConversationRuntime(bagDir);
    yield* rt.clear();
    yield* forceFullGcEffect(3);
    const rss0 = (yield* readProcessRssEffect()).rssKiB;

    let diskAccum = 0;
    const ids: string[] = [];
    for (let i = 0; i < agentCount; i++) {
      const id = yield* rt.createAgent(i);
      yield* rt.driveAllTurns(id, INFINITY_MATCHED_TURNS);
      const { diskBytes } = yield* rt.parkOffloaded(id);
      diskAccum += diskBytes;
      ids.push(id);
    }

    yield* forceFullGcEffect(3);
    const rssAfterPark = (yield* readProcessRssEffect()).rssKiB;
    const pageCacheAfterPark = yield* measureBagPageCacheKiBEffect(bagDir, 2_000, agentCount);
    const diskBytesPerAgent = Math.round((diskAccum / agentCount) * 10) / 10;
    const idsOnlySlope =
      agentCount > 0
        ? Math.round(((rssAfterPark - rss0) / agentCount) * 1000) / 1000
        : null;

    const timedIds = ids.slice(0, wakeSampleSize);
    const timedPaths = timedIds.map((id) => rt.bagPath(id));
    const warmupIds = ids.slice(0, Math.min(Math.max(wakeSampleSize, 50), ids.length));

    // Warm the page cache with a non-timed pass.
    yield* sampleWakeMsEffect(rt, warmupIds);

    const byOrder: OffloadedTradeoffEvidence["wake"]["byOrder"] = [];
    let coldEviction = "skipped";
    /** Page-cache KiB immediately after first successful sample eviction (before cold wake). */
    let pageCacheAfterCold: number | null = null;

    const runWarm = () => sampleWakeMsEffect(rt, timedIds);
    const runCold = () =>
      Effect.gen(function* () {
        const evict = yield* evictBagPageCacheEffect(bagDir, timedPaths);
        coldEviction = `${evict.method}: ${evict.detail}`;
        if (!evict.ok) return [] as number[];
        if (pageCacheAfterCold == null) {
          // Extrapolate from timed sample only — full dir was not evicted.
          pageCacheAfterCold = yield* measureBagPageCacheKiBEffect(
            bagDir,
            timedPaths.length,
            agentCount
          );
        }
        return yield* sampleWakeMsEffect(rt, timedIds);
      });

    const orders = ["warm_then_cold", "cold_then_warm"] as const;
    for (let rep = 0; rep < wakeOrderRepetitions; rep++) {
      for (const order of orders) {
        if (order === "warm_then_cold") {
          yield* sampleWakeMsEffect(rt, timedIds); // prime warm
          const warmSamples = yield* runWarm();
          const coldSamples = yield* runCold();
          byOrder.push({
            order,
            repetition: rep,
            warm: yield* latencyFromSamplesEffect(warmSamples),
            cold: yield* latencyFromSamplesEffect(coldSamples),
            coldEviction,
          });
        } else {
          const coldSamples = yield* runCold();
          const warmSamples = yield* runWarm();
          byOrder.push({
            order,
            repetition: rep,
            warm: yield* latencyFromSamplesEffect(warmSamples),
            cold: yield* latencyFromSamplesEffect(coldSamples),
            coldEviction,
          });
        }
      }
    }
    const warmMs = poolLatencies(byOrder.map((o) => o.warm));
    const coldMs = poolLatencies(byOrder.map((o) => o.cold));

    const pagePerAgent =
      pageCacheAfterPark != null && agentCount > 0
        ? Math.round((pageCacheAfterPark / agentCount) * 1000) / 1000
        : null;

    return {
      kind: "infinity-clawql-offloaded-tradeoff-v1",
      measuredAt: new Date().toISOString(),
      publishable: false,
      host,
      contract: {
        id: INFINITY_MATCHED_CONTRACT_ID,
        turns: INFINITY_MATCHED_TURNS,
        note:
          "Offloaded dens_*.json bags after Infinity-matched unique-content turns. " +
          "Wake = read + parse + restore into DensityConversationRuntime, then re-park. " +
          "Cold = posix_fadvise DONTNEED on the timed sample before wake. " +
          "publishable:false on this KVM cloud-agent host.",
      },
      population: {
        agentsParked: agentCount,
        wakeSampleSize,
        wakeOrderRepetitions,
        diskBytesPerAgent,
        diskBytesTotal: diskAccum,
        bagDir,
      },
      pageCache: {
        afterParkKiB: pageCacheAfterPark,
        afterParkKiBPerAgent: pagePerAgent,
        // Residual after DONTNEED on the timed wake sample only (non-sample bags stay cached).
        afterColdEvictKiB: pageCacheAfterCold,
        method:
          "mincore sample of dens_*.json (host-metrics); cold residual = after sample DONTNEED only",
      },
      wake: {
        warmMs,
        coldMs,
        byOrder,
        coldEviction,
      },
      rss: {
        afterParkKiB: rssAfterPark,
        idsOnlySlopeKiBPerAgent: idsOnlySlope,
      },
      reading:
        `Offloaded trade-off: ~${diskBytesPerAgent} B disk/agent; ` +
        `page cache ≈ ${pagePerAgent ?? "n/a"} KiB/agent after park; ` +
        `warm wake p50=${warmMs.p50} ms p99=${warmMs.p99} ms; ` +
        `cold wake p50=${coldMs.p50} ms p99=${coldMs.p99} ms. ` +
        `Pair with Infinity serverless/external-store, not in-memory agent_scale. No win copy.`,
    } satisfies OffloadedTradeoffEvidence;
  });
}

export function writeOffloadedTradeoffEvidenceEffect(
  evidence: OffloadedTradeoffEvidence,
  path: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return path;
  });
}

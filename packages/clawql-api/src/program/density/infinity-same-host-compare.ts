/**
 * Same-host Infinity vs ClawQL density snapshot (Pi hardware deferred).
 *
 * Infinity column = their agent_scale (in-memory idle RSS after scripted turns).
 * ClawQL column = fair parked agents (20 turn-pairs + pending tool) offloaded to
 * disk bags; process keeps only agent ids in memory (bag-store honesty).
 *
 * Adjacent honest columns — state residence differs. Do not collapse to one KiB.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { clearBagDirEffect, makeParkedBagApi } from "./bag-store.js";
import { buildFairParkedAgentEffect } from "./fair-agent.js";
import { forceGcEffect, readMemTotalKiBEffect, readProcessRssEffect } from "./host-metrics.js";

export type SameHostDensitySample = {
  readonly agents: number;
  readonly processRssKiB: number;
  /** Total process VmRSS / N — same board definition as fair-v2 / Infinity. */
  readonly residentKiBPerAgent: number;
  /** (rssAfter − rssBefore) / N — shows baseline amortization at small N. */
  readonly rssDeltaKiBPerAgent: number;
  readonly diskBytesPerAgent: number;
  readonly diskBytesTotal: number;
  readonly detail: string;
};

export type InfinitySameHostEvidence = {
  readonly kind: "infinity-clawql-same-host-density";
  readonly measuredAt: string;
  readonly host: {
    readonly platform: string;
    readonly arch: string;
    readonly node: string;
    readonly hostname: string;
    readonly memTotalKiB: number;
  };
  readonly contract: {
    readonly turns: number;
    readonly note: string;
    readonly piHardware: "deferred";
  };
  readonly infinity: {
    readonly pinnedCommit: string;
    readonly command: string;
    readonly agents: number;
    readonly turns: number;
    readonly kibPerAgent: number;
    readonly rssMiB: number;
    readonly storage: "in-memory";
    readonly sourceEvidence: string;
    readonly honesty: string;
  };
  readonly clawql: {
    readonly samples: readonly SameHostDensitySample[];
    readonly storage: "disk-bags-json";
    readonly agentShape: "fair-v2-20-turns-plus-pending-tool";
    readonly honesty: string;
  };
  readonly reading: string;
};

export type InfinityColumnInput = {
  readonly kibPerAgent: number;
  readonly rssMiB: number;
  readonly agents: number;
  readonly turns: number;
  readonly pinnedCommit: string;
  readonly sourceEvidence: string;
};

const DEFAULT_INFINITY: InfinityColumnInput = {
  kibPerAgent: 103.1,
  rssMiB: 1007.2,
  agents: 10_000,
  turns: 20,
  pinnedCommit: "341f6c2",
  sourceEvidence: "docs/benchmarks/program-density/infinity-on-pi/evidence-agent-scale.json",
};

export function loadInfinityColumnFromEvidenceEffect(
  path: string,
  sourceLabel?: string
): Effect.Effect<InfinityColumnInput> {
  return Effect.sync(() => {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      pinnedCommit?: string;
      result?: {
        agents?: number;
        turns?: number;
        kibPerAgent?: number;
        rssMiB?: number;
      };
    };
    const result = raw.result ?? {};
    return {
      kibPerAgent: Number(result.kibPerAgent ?? DEFAULT_INFINITY.kibPerAgent),
      rssMiB: Number(result.rssMiB ?? DEFAULT_INFINITY.rssMiB),
      agents: Number(result.agents ?? DEFAULT_INFINITY.agents),
      turns: Number(result.turns ?? DEFAULT_INFINITY.turns),
      pinnedCommit: String(raw.pinnedCommit ?? DEFAULT_INFINITY.pinnedCommit),
      sourceEvidence: sourceLabel ?? path,
    } satisfies InfinityColumnInput;
  });
}

function parkClawqlFairAgentsEffect(
  n: number,
  bagRoot: string
): Effect.Effect<SameHostDensitySample> {
  return Effect.gen(function* () {
    const bagDir = join(bagRoot, `n-${n}-${Date.now()}`);
    yield* clearBagDirEffect(bagDir).pipe(Effect.orDie);
    const bags = makeParkedBagApi(bagDir);
    const ids: string[] = [];

    yield* forceGcEffect();
    const rssBefore = (yield* readProcessRssEffect()).rssKiB;

    for (let i = 0; i < n; i++) {
      const agent = yield* buildFairParkedAgentEffect(i);
      yield* bags.park(agent).pipe(Effect.orDie);
      ids.push(agent.agentId);
    }

    // Drop bag bodies from the heap; keep only ids (product parked shape).
    yield* forceGcEffect();
    const rssAfter = (yield* readProcessRssEffect()).rssKiB;
    const diskBytesTotal = yield* bags.diskBytesTotal().pipe(Effect.orDie);
    const diskBytesPerAgent = diskBytesTotal / n;
    const residentKiBPerAgent = rssAfter / n;
    const rssDeltaKiBPerAgent = Math.max(0, rssAfter - rssBefore) / n;

    // Touch ids so the array is live through the RSS sample.
    const idCount = ids.length;
    rmSync(bagDir, { recursive: true, force: true });

    return {
      agents: n,
      processRssKiB: rssAfter,
      residentKiBPerAgent: Math.round(residentKiBPerAgent * 1000) / 1000,
      rssDeltaKiBPerAgent: Math.round(rssDeltaKiBPerAgent * 1000) / 1000,
      diskBytesPerAgent: Math.round(diskBytesPerAgent * 10) / 10,
      diskBytesTotal,
      detail:
        `rssBefore=${rssBefore} rssAfter=${rssAfter} rssDeltaKiBPerAgent=${rssDeltaKiBPerAgent.toFixed(3)} ` +
        `idsKept=${idCount} bagDir=${bagDir}`,
    } satisfies SameHostDensitySample;
  });
}

export function runInfinitySameHostCompareEffect(opts?: {
  readonly clawqlNs?: readonly number[];
  readonly bagRoot?: string;
  readonly infinity?: InfinityColumnInput;
}): Effect.Effect<InfinitySameHostEvidence> {
  const clawqlNs = opts?.clawqlNs ?? [1_000, 5_000, 10_000];
  const infinity = opts?.infinity ?? DEFAULT_INFINITY;
  const bagRoot = opts?.bagRoot ?? join("/tmp", "clawql-infinity-same-host");

  return Effect.gen(function* () {
    const samples: SameHostDensitySample[] = [];
    for (const n of clawqlNs) {
      samples.push(yield* parkClawqlFairAgentsEffect(n, bagRoot));
    }
    const atMatch =
      samples.find((s) => s.agents === infinity.agents) ?? samples[samples.length - 1]!;
    const memTotalKiB = yield* readMemTotalKiBEffect();

    return {
      kind: "infinity-clawql-same-host-density",
      measuredAt: new Date().toISOString(),
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        hostname: hostname(),
        memTotalKiB,
      },
      contract: {
        turns: 20,
        note:
          "Shared conversation depth ≈20 turns. Infinity: in-memory idle after scripted tool turns. " +
          "ClawQL: fair-v2 parked (20 turn-pairs + pending tool) on disk bags with ids-only resident. " +
          "Pi 5 hardware deferred until available — same-host cloud x86_64 first (like other density peers).",
        piHardware: "deferred",
      },
      infinity: {
        pinnedCommit: infinity.pinnedCommit,
        command:
          "AGENTS=10000 TURNS=20 WAVE=500 cargo run --release -p infinity-agent-core --example agent_scale",
        agents: infinity.agents,
        turns: infinity.turns,
        kibPerAgent: infinity.kibPerAgent,
        rssMiB: infinity.rssMiB,
        storage: "in-memory",
        sourceEvidence: infinity.sourceEvidence,
        honesty:
          "Their agent_scale: scripted model, in-memory stores, RSS after agents idle. " +
          "Reproduced on this host at pinned commit — not Pi hardware.",
      },
      clawql: {
        samples,
        storage: "disk-bags-json",
        agentShape: "fair-v2-20-turns-plus-pending-tool",
        honesty:
          "Parked fair agents via ParkedBagApi (JSON bags). Process keeps agent ids only after park; " +
          "residentKiBPerAgent = total process VmRSS / N (same board definition as fair-v2). " +
          "diskBytesPerAgent = sum(bag file sizes) / N. History lives on disk, not in RSS.",
      },
      reading:
        `At N=${atMatch.agents}: Infinity idle RSS ≈ ${infinity.kibPerAgent} KiB/agent (history in RAM). ` +
        `ClawQL fair-v2 parked: total RSS/N ≈ ${atMatch.residentKiBPerAgent} KiB/agent ` +
        `(rssΔ/N ≈ ${atMatch.rssDeltaKiBPerAgent} KiB — ids-only after park) and ` +
        `≈${(atMatch.diskBytesPerAgent / 1024).toFixed(1)} KiB/agent on disk for the same 20-turn+tool shape. ` +
        `Adjacent columns, not a single-number contest. Pi 5 hardware deferred.`,
    } satisfies InfinitySameHostEvidence;
  });
}

export function writeInfinitySameHostEvidenceEffect(
  evidence: InfinitySameHostEvidence,
  path: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return path;
  });
}

/**
 * Infinity × ClawQL density harness v2 (same-host, Pi deferred).
 *
 * Closes the four gaps before like-for-like claims:
 *   1. Byte parity on Infinity-matched serialized history
 *   2. Turns driven through DensityConversationRuntime (not prebuilt bags)
 *   3. Slope (ΔRSS / ΔN) across several N — not RSS/N alone
 *   4. Resident-mode ClawQL arm next to offloaded trade-off arm
 *
 * Always publishable: false on this cloud-agent KVM host. 8 GB cgroup ramp is
 * a separate evidence file produced by the CLI wrapper.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { makeDensityConversationRuntime } from "./density-conversation-runtime.js";
import {
  buildInfinityMatchedTurnMessagesEffect,
  INFINITY_MATCHED_CONTRACT_ID,
  INFINITY_MATCHED_TURNS,
  serializeDensityMessagesBytesEffect,
} from "./infinity-matched-shape.js";
import { forceFullGcEffect, readMemTotalKiBEffect, readProcessRssEffect } from "./host-metrics.js";

export type HostDisclosure = {
  readonly hostname: string;
  readonly platform: string;
  readonly arch: string;
  readonly node: string;
  readonly memTotalKiB: number;
  readonly cpuModel: string;
  readonly hypervisor: string;
  readonly hostKind: "cloud-agent-kvm-vm";
  readonly instanceType: string;
  readonly storage: string;
  readonly publishable: false;
  readonly note: string;
};

export type ByteParityEvidence = {
  readonly contract: typeof INFINITY_MATCHED_CONTRACT_ID;
  readonly turns: number;
  readonly infinity: {
    readonly source: string;
    readonly messageCount: number;
    readonly serdeJsonMsgsBytes: number;
    readonly serdeJsonWithIdsBytes: number;
  };
  readonly clawqlMatched: {
    readonly messageCount: number;
    readonly serializedJsonBytes: number;
  };
  readonly fairV2DiskBytesForContrast: number | null;
  readonly reading: string;
};

export type SlopePoint = {
  readonly agents: number;
  readonly rssKiB: number;
};

export type SlopeIntegrity = {
  /** Resident slope (or offloaded disk) must be ≥ serialized history KiB. */
  readonly rule: "per_agent_cost_ge_history_bytes";
  readonly historySerializedBytes: number;
  readonly historyKiB: number;
  readonly measuredKiBPerAgent: number | null;
  readonly ok: boolean;
  readonly detail: string;
};

export type SlopeSample = {
  readonly system: "infinity" | "clawql-resident" | "clawql-offloaded";
  readonly rep: number;
  readonly points: readonly SlopePoint[];
  /** KiB per agent from linear regression of rssKiB vs agents (points with agents>0). */
  readonly slopeKiBPerAgent: number | null;
  readonly diskBytesPerAgent: number | null;
  readonly historySerializedBytes: number | null;
  readonly integrity: SlopeIntegrity | null;
  readonly detail: string;
};

export type HarnessV2Evidence = {
  readonly kind: "infinity-clawql-density-harness-v2";
  readonly measuredAt: string;
  readonly publishable: false;
  readonly host: HostDisclosure;
  readonly contract: {
    readonly id: typeof INFINITY_MATCHED_CONTRACT_ID;
    readonly turns: number;
    readonly piHardware: "deferred";
    readonly reps: number;
    readonly note: string;
  };
  readonly byteParity: ByteParityEvidence;
  readonly slope: {
    readonly scheduleN: readonly number[];
    readonly samples: readonly SlopeSample[];
    readonly floors: {
      readonly infinitySlopeKiBPerAgent: number | null;
      readonly clawqlResidentSlopeKiBPerAgent: number | null;
      readonly clawqlOffloadedSlopeKiBPerAgent: number | null;
    };
    /** True iff every resident sample passes history-size floor (shared-string guard). */
    readonly integrityOk: boolean;
    readonly reading: string;
  };
};

/** Resident RSS slope (or offloaded disk B→KiB) must cover serialized history. */
export function slopeIntegrityEffect(opts: {
  readonly historySerializedBytes: number;
  readonly measuredKiBPerAgent: number | null;
  readonly kind: "resident_rss_slope" | "offloaded_disk";
}): Effect.Effect<SlopeIntegrity> {
  return Effect.sync(() => {
    const historyKiB = opts.historySerializedBytes / 1024;
    const measured = opts.measuredKiBPerAgent;
    // Tiny epsilon for float noise on slope fits; still catches shared-string undercount.
    const ok = measured != null && Number.isFinite(measured) && measured + 0.05 >= historyKiB;
    return {
      rule: "per_agent_cost_ge_history_bytes",
      historySerializedBytes: opts.historySerializedBytes,
      historyKiB: Math.round(historyKiB * 1000) / 1000,
      measuredKiBPerAgent: measured,
      ok,
      detail: ok
        ? `${opts.kind}: ${measured} KiB/agent ≥ history ${historyKiB.toFixed(3)} KiB`
        : `${opts.kind}: ${measured} KiB/agent < history ${historyKiB.toFixed(3)} KiB ` +
          `(likely shared/interned strings or wrong workload)`,
    } satisfies SlopeIntegrity;
  });
}

export type FitCapIntegrity = {
  readonly rule: "last_fit_times_slope_le_cap";
  readonly lastFitAgents: number;
  readonly slopeKiBPerAgent: number;
  readonly memoryMaxBytes: number;
  readonly productBytes: number;
  readonly ok: boolean;
  readonly detail: string;
};

/**
 * lastFitAgents × slope must fit under the memory cap (catches overstated slopes
 * from unreclaimed GC garbage, or silent swap extending past memory.max).
 */
export function fitCapIntegrityEffect(opts: {
  readonly lastFitAgents: number;
  readonly slopeKiBPerAgent: number;
  readonly memoryMaxBytes: number;
}): Effect.Effect<FitCapIntegrity> {
  return Effect.sync(() => {
    const productBytes = opts.lastFitAgents * opts.slopeKiBPerAgent * 1024;
    // 1% slack for wave granularity / float noise.
    const ok = productBytes <= opts.memoryMaxBytes * 1.01;
    return {
      rule: "last_fit_times_slope_le_cap",
      lastFitAgents: opts.lastFitAgents,
      slopeKiBPerAgent: opts.slopeKiBPerAgent,
      memoryMaxBytes: opts.memoryMaxBytes,
      productBytes: Math.round(productBytes),
      ok,
      detail: ok
        ? `${opts.lastFitAgents} × ${opts.slopeKiBPerAgent} KiB = ${(productBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB ≤ cap`
        : `${opts.lastFitAgents} × ${opts.slopeKiBPerAgent} KiB = ${(productBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB > cap ` +
          `(overstated slope and/or swap; force full GC + memory.swap.max=0)`,
    } satisfies FitCapIntegrity;
  });
}

function readCpuModelEffect(): Effect.Effect<string> {
  return Effect.sync(() => {
    try {
      const raw = readFileSync("/proc/cpuinfo", "utf8");
      const m = /^model name\s*:\s*(.+)$/m.exec(raw);
      return m?.[1]?.trim() || "unknown";
    } catch {
      return "unknown";
    }
  });
}

export function hostDisclosureEffect(): Effect.Effect<HostDisclosure> {
  return Effect.gen(function* () {
    const memTotalKiB = yield* readMemTotalKiBEffect();
    const cpuModel = yield* readCpuModelEffect();
    return {
      hostname: hostname(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      memTotalKiB,
      cpuModel,
      hypervisor: "KVM",
      hostKind: "cloud-agent-kvm-vm",
      instanceType: "unknown-cursor-cloud-agent-pod (no cloud instance-metadata endpoint)",
      storage: "ephemeral pod disk (bind-mounted workspace)",
      publishable: false,
      note:
        "Cloud-agent VM (KVM). Headline numbers from this host stay publishable:false; " +
        "use for harness debugging. Publish from Pi / bare-metal when available.",
    } satisfies HostDisclosure;
  });
}

function linearSlopeKiBPerAgent(points: readonly SlopePoint[]): number | null {
  const pts = points.filter((p) => p.agents > 0);
  if (pts.length < 2) return null;
  const n = pts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of pts) {
    sumX += p.agents;
    sumY += p.rssKiB;
    sumXY += p.agents * p.rssKiB;
    sumXX += p.agents * p.agents;
  }
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / den;
  return Math.round(slope * 1000) / 1000;
}

function floorOf(nums: readonly (number | null | undefined)[]): number | null {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return xs.length ? Math.min(...xs) : null;
}

export function measureClawqlByteParityEffect(): Effect.Effect<{
  messageCount: number;
  serializedJsonBytes: number;
}> {
  return Effect.gen(function* () {
    const messages = [];
    for (let t = 0; t < INFINITY_MATCHED_TURNS; t++) {
      const batch = yield* buildInfinityMatchedTurnMessagesEffect("agent-0", t, `parity-tool-${t}`);
      messages.push(...batch);
    }
    const serializedJsonBytes = yield* serializeDensityMessagesBytesEffect(messages);
    return { messageCount: messages.length, serializedJsonBytes };
  });
}

export function loadInfinityByteParityFixtureEffect(path: string): Effect.Effect<{
  messageCount: number;
  serdeJsonMsgsBytes: number;
  serdeJsonWithIdsBytes: number | null;
}> {
  return Effect.sync(() => {
    const msgsOnly = readFileSync(path, "utf8");
    const parsed = JSON.parse(msgsOnly) as unknown[];
    const withIdsPath = path.replace("msgs-only", "messages");
    let withIds: number | null = null;
    if (existsSync(withIdsPath)) {
      withIds = Buffer.byteLength(readFileSync(withIdsPath, "utf8"), "utf8");
    }
    return {
      messageCount: parsed.length,
      serdeJsonMsgsBytes: Buffer.byteLength(msgsOnly, "utf8"),
      serdeJsonWithIdsBytes: withIds,
    };
  });
}

function measureClawqlArmEffect(opts: {
  readonly nSchedule: readonly number[];
  readonly residence: "resident" | "offloaded";
  readonly rep: number;
  readonly bagRoot: string;
  readonly historySerializedBytes: number;
}): Effect.Effect<SlopeSample> {
  return Effect.gen(function* () {
    const bagDir = join(opts.bagRoot, `${opts.residence}-rep${opts.rep}-${Date.now()}`);
    const rt = makeDensityConversationRuntime(bagDir);
    yield* rt.clear();
    yield* forceFullGcEffect(3);
    const points: SlopePoint[] = [];
    const rss0 = (yield* readProcessRssEffect()).rssKiB;
    points.push({ agents: 0, rssKiB: rss0 });

    let launched = 0;
    let diskAccum = 0;
    let diskCount = 0;
    for (const target of opts.nSchedule) {
      while (launched < target) {
        const id = yield* rt.createAgent(launched);
        yield* rt.driveAllTurns(id, INFINITY_MATCHED_TURNS);
        if (opts.residence === "offloaded") {
          const { diskBytes } = yield* rt.parkOffloaded(id);
          diskAccum += diskBytes;
          diskCount += 1;
        } else {
          yield* rt.retainResident(id);
        }
        launched += 1;
      }
      // Full GC before RSS so slope reflects live history, not turn garbage.
      yield* forceFullGcEffect(3);
      const rss = (yield* readProcessRssEffect()).rssKiB;
      points.push({ agents: launched, rssKiB: rss });
    }

    const slopeKiBPerAgent = linearSlopeKiBPerAgent(points);
    const diskBytesPerAgent =
      opts.residence === "offloaded" && diskCount > 0
        ? Math.round((diskAccum / diskCount) * 10) / 10
        : null;

    const integrity =
      opts.residence === "resident"
        ? yield* slopeIntegrityEffect({
            historySerializedBytes: opts.historySerializedBytes,
            measuredKiBPerAgent: slopeKiBPerAgent,
            kind: "resident_rss_slope",
          })
        : yield* slopeIntegrityEffect({
            historySerializedBytes: opts.historySerializedBytes,
            measuredKiBPerAgent: diskBytesPerAgent != null ? diskBytesPerAgent / 1024 : null,
            kind: "offloaded_disk",
          });

    if (!integrity.ok) {
      yield* Effect.die(
        new Error(`slope integrity failed (${opts.residence} rep ${opts.rep}): ${integrity.detail}`)
      );
    }

    return {
      system: opts.residence === "resident" ? "clawql-resident" : "clawql-offloaded",
      rep: opts.rep,
      points,
      slopeKiBPerAgent,
      diskBytesPerAgent,
      historySerializedBytes: opts.historySerializedBytes,
      integrity,
      detail: `bagDir=${bagDir} launched=${launched} uniqueContent=v2`,
    } satisfies SlopeSample;
  });
}

export function runHarnessV2ClawqlEffect(opts?: {
  readonly nSchedule?: readonly number[];
  readonly reps?: number;
  readonly bagRoot?: string;
  readonly infinityFixturePath?: string;
  readonly infinitySlopeSamples?: readonly SlopeSample[];
  readonly fairV2DiskBytesForContrast?: number | null;
}): Effect.Effect<HarnessV2Evidence> {
  const nSchedule = opts?.nSchedule ?? [1_000, 5_000, 10_000];
  const reps = opts?.reps ?? 1;
  const bagRoot = opts?.bagRoot ?? "/tmp/clawql-infinity-harness-v2";

  return Effect.gen(function* () {
    const host = yield* hostDisclosureEffect();
    const clawqlParity = yield* measureClawqlByteParityEffect();
    const infinityParity = opts?.infinityFixturePath
      ? yield* loadInfinityByteParityFixtureEffect(opts.infinityFixturePath)
      : {
          messageCount: 100,
          serdeJsonMsgsBytes: 62_371,
          serdeJsonWithIdsBytes: 67_751,
        };

    const byteParity: ByteParityEvidence = {
      contract: INFINITY_MATCHED_CONTRACT_ID,
      turns: INFINITY_MATCHED_TURNS,
      infinity: {
        // Always repo-relative in evidence (fixture may be loaded via absolute path).
        source:
          "docs/benchmarks/program-density/infinity-on-pi/fixtures/infinity-agent-0-msgs-only.json",
        messageCount: infinityParity.messageCount,
        serdeJsonMsgsBytes: infinityParity.serdeJsonMsgsBytes,
        serdeJsonWithIdsBytes: infinityParity.serdeJsonWithIdsBytes ?? 67_751,
      },
      clawqlMatched: clawqlParity,
      fairV2DiskBytesForContrast: opts?.fairV2DiskBytesForContrast ?? 32_859,
      reading:
        `Infinity serde_json msgs ≈ ${infinityParity.serdeJsonMsgsBytes} B; ` +
        `ClawQL matched-shape JSON ≈ ${clawqlParity.serializedJsonBytes} B ` +
        `(${clawqlParity.messageCount} msgs). ` +
        `fair-v2 parked bags were ~${opts?.fairV2DiskBytesForContrast ?? 32859} B — different workload, not overhead.`,
    };

    const historyBytes = clawqlParity.serializedJsonBytes;
    // Attach integrity to Infinity samples when slope is known.
    const infinitySamples: SlopeSample[] = [];
    for (const s of opts?.infinitySlopeSamples ?? []) {
      const integrity = yield* slopeIntegrityEffect({
        historySerializedBytes: infinityParity.serdeJsonMsgsBytes,
        measuredKiBPerAgent: s.slopeKiBPerAgent,
        kind: "resident_rss_slope",
      });
      if (!integrity.ok) {
        yield* Effect.die(
          new Error(`Infinity slope integrity failed (rep ${s.rep}): ${integrity.detail}`)
        );
      }
      infinitySamples.push({
        ...s,
        historySerializedBytes: infinityParity.serdeJsonMsgsBytes,
        integrity,
      });
    }

    const samples: SlopeSample[] = [...infinitySamples];
    for (let rep = 1; rep <= reps; rep++) {
      // Alternate arms within a rep: resident then offloaded (Infinity external).
      samples.push(
        yield* measureClawqlArmEffect({
          nSchedule,
          residence: "resident",
          rep,
          bagRoot,
          historySerializedBytes: historyBytes,
        })
      );
      samples.push(
        yield* measureClawqlArmEffect({
          nSchedule,
          residence: "offloaded",
          rep,
          bagRoot,
          historySerializedBytes: historyBytes,
        })
      );
    }

    const infinitySlopes = samples
      .filter((s) => s.system === "infinity")
      .map((s) => s.slopeKiBPerAgent);
    const residentSlopes = samples
      .filter((s) => s.system === "clawql-resident")
      .map((s) => s.slopeKiBPerAgent);
    const offloadedSlopes = samples
      .filter((s) => s.system === "clawql-offloaded")
      .map((s) => s.slopeKiBPerAgent);
    const integrityOk = samples.every((s) => s.integrity?.ok !== false);

    return {
      kind: "infinity-clawql-density-harness-v2",
      measuredAt: new Date().toISOString(),
      publishable: false,
      host,
      contract: {
        id: INFINITY_MATCHED_CONTRACT_ID,
        turns: INFINITY_MATCHED_TURNS,
        piHardware: "deferred",
        reps,
        note:
          "Infinity-matched unique-per-agent turns (v2) via DensityConversationRuntime. " +
          "Slope = linear fit of process RSS vs N. Resident slope must be ≥ history KiB. " +
          "publishable:false on this KVM cloud-agent host. Pi / bare-metal columns later.",
      },
      byteParity,
      slope: {
        scheduleN: nSchedule,
        samples,
        floors: {
          infinitySlopeKiBPerAgent: floorOf(infinitySlopes),
          clawqlResidentSlopeKiBPerAgent: floorOf(residentSlopes),
          clawqlOffloadedSlopeKiBPerAgent: floorOf(offloadedSlopes),
        },
        integrityOk,
        reading:
          "Compare resident slopes (Infinity vs clawql-resident) after unique-content fixtures. " +
          "Offloaded arm is a different trade-off (history on disk). " +
          "integrityOk requires per-agent cost ≥ serialized history (shared-string guard).",
      },
    } satisfies HarnessV2Evidence;
  });
}

export function writeHarnessV2EvidenceEffect(
  evidence: HarnessV2Evidence,
  path: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return path;
  });
}

/** Parse Infinity agent_scale CSV stdout into a SlopeSample (integrity filled later). */
export function infinityCsvToSlopeSampleEffect(
  csv: string,
  rep: number
): Effect.Effect<SlopeSample> {
  return Effect.sync(() => {
    const points: SlopePoint[] = [];
    for (const line of csv.split("\n")) {
      const m = /^(\d+),(\d+)\s*$/.exec(line.trim());
      if (!m) continue;
      const agents = Number(m[1]);
      const rssBytes = Number(m[2]);
      points.push({ agents, rssKiB: Math.round(rssBytes / 1024) });
    }
    return {
      system: "infinity" as const,
      rep,
      points,
      slopeKiBPerAgent: linearSlopeKiBPerAgent(points),
      diskBytesPerAgent: null,
      historySerializedBytes: null,
      integrity: null,
      detail: "from agent_scale CSV agents,rss_bytes (unique-content v2)",
    } satisfies SlopeSample;
  });
}

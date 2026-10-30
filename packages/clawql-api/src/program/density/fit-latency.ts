/**
 * Fit-quality probe under an 8 GiB memory cap.
 *
 * Headline metric: agents that actually fit (lastFit), not slope extrapolation.
 * Quality gate: per-turn latency within `ceilingMultiple`× of the low-N baseline;
 * report the highest N that still qualifies for both systems.
 *
 * publishable: false on this KVM cloud-agent host.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { makeDensityConversationRuntime } from "./density-conversation-runtime.js";
import {
  INFINITY_MATCHED_CONTRACT_ID,
  INFINITY_MATCHED_TURNS,
} from "./infinity-matched-shape.js";
import {
  forceFullGcEffect,
  percentileMsEffect,
  readProcessRssEffect,
} from "./host-metrics.js";
import { hostDisclosureEffect, type HostDisclosure } from "./infinity-harness-v2.js";

export type TurnLatencyStats = {
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
  readonly n: number;
  readonly turnsPerSec: number;
};

export type FitLatencyCheckpoint = {
  readonly agents: number;
  readonly rssKiB: number;
  readonly turn: TurnLatencyStats;
  readonly within2xOfBaseline: boolean | null;
  readonly note: string;
};

export type FitLatencyEvidence = {
  readonly kind: "clawql-resident-8g-fit-latency-v1";
  readonly measuredAt: string;
  readonly publishable: false;
  readonly host: HostDisclosure;
  readonly contract: {
    readonly id: typeof INFINITY_MATCHED_CONTRACT_ID;
    readonly turns: number;
    readonly note: string;
  };
  readonly cgroup: {
    readonly path: string | null;
    readonly memoryMaxBytes: number;
    readonly memorySwapMax: string | null;
    readonly memoryPeakBytes: number | null;
    readonly memorySwapPeak: string | null;
  };
  readonly tuning: {
    readonly nodeFlags: string;
    readonly note: string;
  };
  readonly protocol: {
    readonly baselineAgents: number;
    readonly lastFitTarget: number;
    readonly step: number;
    readonly probeSample: number;
    readonly ceilingMultiple: number;
    readonly probeTurns: number;
    readonly probeEverySteps: number;
  };
  readonly baseline: FitLatencyCheckpoint;
  readonly atLastFit: FitLatencyCheckpoint | null;
  readonly checkpoints: readonly FitLatencyCheckpoint[];
  readonly highestNWithin2x: number | null;
  /** Highest N with every probed checkpoint from baseline through N within 2×. */
  readonly highestContiguousNWithin2x: number | null;
  /** cgroup memory.peak / lastFitAgents (KiB), else RSS/N. */
  readonly peakMemKiBPerAgentAtLastFit: number | null;
  /** Process RSS/N at lastFit (paired per-agent figure alongside Infinity). */
  readonly rssKiBPerAgentAtLastFit: number | null;
  readonly lastFitAgents: number | null;
  readonly oomOrAbort: { readonly atAgents: number; readonly error: string } | null;
  readonly reading: string;
};

function readCgroupField(cgroup: string | null, name: string): string | null {
  if (!cgroup) return null;
  try {
    return readFileSync(join(cgroup, name), "utf8").trim();
  } catch {
    return null;
  }
}

function summarizeSamplesEffect(samplesMs: readonly number[]): Effect.Effect<TurnLatencyStats> {
  return Effect.gen(function* () {
    const p50 = yield* percentileMsEffect(samplesMs, 50);
    const p99 = yield* percentileMsEffect(samplesMs, 99);
    const mean =
      samplesMs.length === 0 ? 0 : samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length;
    const turnsPerSec = mean > 0 ? Number((1000 / mean).toFixed(2)) : 0;
    return {
      p50Ms: Number(p50.toFixed(6)),
      p99Ms: Number(p99.toFixed(6)),
      meanMs: Number(mean.toFixed(6)),
      n: samplesMs.length,
      turnsPerSec,
    };
  });
}

/**
 * Time additional driveTurn calls on a resident sample (5 msgs / turn),
 * then roll back those messages so probes do not inflate lastFit RSS.
 */
function probeTurnLatencyEffect(
  rt: ReturnType<typeof makeDensityConversationRuntime>,
  ids: readonly string[],
  sampleSize: number,
  probeTurns: number
): Effect.Effect<TurnLatencyStats> {
  return Effect.gen(function* () {
    const sample = ids.slice(0, Math.min(sampleSize, ids.length));
    const samples: number[] = [];
    for (const id of sample) {
      for (let i = 0; i < probeTurns; i++) {
        const beforeCount = yield* rt.messageCount(id);
        const nextTurn = Math.floor(beforeCount / 5);
        const t0 = process.hrtime.bigint();
        yield* rt.driveTurn(id, nextTurn);
        const t1 = process.hrtime.bigint();
        samples.push(Number(t1 - t0) / 1e6);
        const afterCount = yield* rt.messageCount(id);
        const added = afterCount - beforeCount;
        if (added > 0) yield* rt.rollbackMessages(id, added);
      }
    }
    return yield* summarizeSamplesEffect(samples);
  });
}

function withinCeiling(
  measured: TurnLatencyStats,
  baseline: TurnLatencyStats,
  multiple: number
): boolean {
  if (baseline.p50Ms <= 0 || baseline.p99Ms <= 0) return true;
  return (
    measured.p50Ms <= baseline.p50Ms * multiple && measured.p99Ms <= baseline.p99Ms * multiple
  );
}

export function runClawqlFitLatencyEffect(opts?: {
  readonly baselineAgents?: number;
  readonly lastFitTarget?: number;
  readonly step?: number;
  readonly probeSample?: number;
  readonly probeTurns?: number;
  readonly ceilingMultiple?: number;
  /** Probe every N steps after baseline (1 = every wave). */
  readonly probeEverySteps?: number;
  readonly bagRoot?: string;
  readonly cgroupPath?: string | null;
  readonly memoryMaxBytes?: number;
  /** Incremental evidence path (written after each checkpoint). */
  readonly outPath?: string | null;
}): Effect.Effect<FitLatencyEvidence> {
  const baselineAgents = Math.max(1, opts?.baselineAgents ?? 2_500);
  // 100k leaves headroom for V8 GC under the 8G cgroup; 102.5k was the last
  // RSS sample on a prior interrupted ramp, not a proven stable plateau.
  const lastFitTarget = Math.max(baselineAgents, opts?.lastFitTarget ?? 100_000);
  const step = Math.max(1, opts?.step ?? 2_500);
  const probeSample = Math.max(1, opts?.probeSample ?? 100);
  const probeTurns = Math.max(1, opts?.probeTurns ?? 1);
  const ceilingMultiple = opts?.ceilingMultiple ?? 2;
  const probeEverySteps = Math.max(1, opts?.probeEverySteps ?? 4);
  const bagRoot = opts?.bagRoot ?? "/tmp/clawql-fit-latency";
  const cgroupPath = opts?.cgroupPath ?? null;
  const memoryMaxBytes = opts?.memoryMaxBytes ?? 8_589_934_592;
  const outPath = opts?.outPath ?? null;

  return Effect.gen(function* () {
    const host = yield* hostDisclosureEffect();
    const bagDir = join(bagRoot, `fit-${Date.now()}`);
    const rt = makeDensityConversationRuntime(bagDir);
    yield* rt.clear();
    yield* forceFullGcEffect(3);

    const ids: string[] = [];
    const checkpoints: FitLatencyCheckpoint[] = [];
    let baseline: FitLatencyCheckpoint | null = null;
    let atLastFit: FitLatencyCheckpoint | null = null;
    let highestNWithin2x: number | null = null;
    let oomOrAbort: FitLatencyEvidence["oomOrAbort"] = null;
    let waveIndex = 0;

    const takeCheckpoint = (agents: number, note: string) =>
      Effect.gen(function* () {
        // Wave loop already full-GCs; avoid an extra major GC right before probe
        // near the heap limit (V8 "Ineffective mark-compacts" abort).
        const rssKiB = (yield* readProcessRssEffect()).rssKiB;
        const turn = yield* probeTurnLatencyEffect(rt, ids, probeSample, probeTurns);
        const within =
          baseline == null ? null : withinCeiling(turn, baseline.turn, ceilingMultiple);
        const cp: FitLatencyCheckpoint = {
          agents,
          rssKiB,
          turn,
          within2xOfBaseline: within,
          note,
        };
        checkpoints.push(cp);
        if (within === true || note === "baseline") {
          highestNWithin2x = agents;
        }
        if (outPath) {
          const peakRaw = readCgroupField(cgroupPath, "memory.peak");
          yield* writeFitLatencyPartialEffect(outPath, {
            measuredAt: new Date().toISOString(),
            publishable: false,
            status: "running",
            baseline,
            atLastFit: note.includes("lastFit") ? cp : atLastFit,
            checkpoints: [...checkpoints],
            highestNWithin2x,
            lastFitAgents: agents,
            peakMemKiBPerAgentAtLastFit:
              peakRaw && /^\d+$/.test(peakRaw) && agents > 0
                ? Math.round((Number(peakRaw) / 1024 / agents) * 1000) / 1000
                : Math.round((rssKiB / agents) * 1000) / 1000,
            cgroup: {
              path: cgroupPath,
              memoryMaxBytes,
              memoryPeakBytes: peakRaw && /^\d+$/.test(peakRaw) ? Number(peakRaw) : null,
              memorySwapMax: readCgroupField(cgroupPath, "memory.swap.max"),
              memorySwapPeak: readCgroupField(cgroupPath, "memory.swap.peak"),
            },
            tuning: {
              nodeFlags: "--expose-gc --max-old-space-size=8192",
            },
          });
        }
        return cp;
      });

    try {
      while (ids.length < lastFitTarget) {
        const target = Math.min(ids.length + step, lastFitTarget);
        while (ids.length < target) {
          const id = yield* rt.createAgent(ids.length);
          yield* rt.driveAllTurns(id, INFINITY_MATCHED_TURNS);
          yield* rt.retainResident(id);
          ids.push(id);
        }
        waveIndex += 1;
        // Match 8G ramp: full GC after every wave so pressure tracks live history
        // (without this, V8 retains garbage and OOM arrives well before lastFit).
        yield* forceFullGcEffect(3);

        const atEnd = ids.length >= lastFitTarget;
        const every = waveIndex % probeEverySteps === 0;
        // Always probe baseline (first time we reach/pass it) and lastFit.
        const shouldProbe =
          (ids.length >= baselineAgents && baseline == null) ||
          atEnd ||
          (every && ids.length > baselineAgents);

        if (shouldProbe) {
          const note =
            baseline == null && ids.length >= baselineAgents
              ? "baseline"
              : atEnd
                ? "lastFit_target"
                : `wave_${ids.length}`;
          const cp = yield* takeCheckpoint(ids.length, note);
          if (cp.note === "baseline") baseline = cp;
          if (cp.note === "lastFit_target") atLastFit = cp;
        }
      }
    } catch (e) {
      oomOrAbort = {
        atAgents: ids.length,
        error: e instanceof Error ? e.message : String(e),
      };
      if (ids.length > 0 && atLastFit == null) {
        try {
          atLastFit = yield* takeCheckpoint(ids.length, "last_before_abort");
        } catch {
          /* probe itself may fail under OOM */
        }
      }
    }

    if (baseline == null && ids.length > 0) {
      baseline = yield* takeCheckpoint(Math.min(ids.length, baselineAgents), "baseline_fallback");
    }

    const peakRaw = readCgroupField(cgroupPath, "memory.peak");
    const peakBytes = peakRaw != null && /^\d+$/.test(peakRaw) ? Number(peakRaw) : null;
    const lastFitAgents =
      atLastFit?.agents ?? oomOrAbort?.atAgents ?? (ids.length > 0 ? ids.length : null);
    const peakMemKiBPerAgentAtLastFit =
      peakBytes != null && lastFitAgents != null && lastFitAgents > 0
        ? Math.round((peakBytes / 1024 / lastFitAgents) * 1000) / 1000
        : atLastFit != null && atLastFit.agents > 0
          ? Math.round((atLastFit.rssKiB / atLastFit.agents) * 1000) / 1000
          : null;

    if (highestNWithin2x == null && baseline != null) {
      highestNWithin2x = baseline.agents;
    }

    let highestContiguousNWithin2x: number | null = baseline?.agents ?? null;
    for (const c of checkpoints) {
      if (c.note === "baseline") {
        highestContiguousNWithin2x = c.agents;
        continue;
      }
      if (c.within2xOfBaseline === true) {
        highestContiguousNWithin2x = c.agents;
      } else if (c.within2xOfBaseline === false) {
        break;
      }
    }

    const rssKiBPerAgentAtLastFit =
      atLastFit != null && atLastFit.agents > 0
        ? Math.round((atLastFit.rssKiB / atLastFit.agents) * 1000) / 1000
        : null;

    const reading = [
      `Headline = measured agents under ${memoryMaxBytes} B cap (swap.max=0), not slope×cap.`,
      baseline
        ? `Baseline N=${baseline.agents}: turn p50=${baseline.turn.p50Ms} ms p99=${baseline.turn.p99Ms} ms (${baseline.turn.turnsPerSec}/s).`
        : "",
      atLastFit
        ? `At N=${atLastFit.agents}: turn p50=${atLastFit.turn.p50Ms} ms p99=${atLastFit.turn.p99Ms} ms (${atLastFit.turn.turnsPerSec}/s); within ${ceilingMultiple}×=${atLastFit.within2xOfBaseline}.`
        : "",
      `highestNWithin2x=${highestNWithin2x} (contiguous=${highestContiguousNWithin2x}).`,
      rssKiBPerAgentAtLastFit != null
        ? `RSS/N at lastFit ≈ ${rssKiBPerAgentAtLastFit} KiB/agent.`
        : "",
      peakMemKiBPerAgentAtLastFit != null
        ? `cgroup peak/N ≈ ${peakMemKiBPerAgentAtLastFit} KiB/agent.`
        : "",
      "Tuning: --expose-gc --max-old-space-size=8192.",
      oomOrAbort ? `Aborted at ${oomOrAbort.atAgents}: ${oomOrAbort.error}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      kind: "clawql-resident-8g-fit-latency-v1",
      measuredAt: new Date().toISOString(),
      publishable: false,
      host,
      contract: {
        id: INFINITY_MATCHED_CONTRACT_ID,
        turns: INFINITY_MATCHED_TURNS,
        note:
          "Per-turn = DensityConversationRuntime.driveTurn (matched-shape append under pressure). " +
          "History-cost harness — not full durable/MCP stack.",
      },
      cgroup: {
        path: cgroupPath,
        memoryMaxBytes,
        memorySwapMax: readCgroupField(cgroupPath, "memory.swap.max"),
        memoryPeakBytes: peakBytes,
        memorySwapPeak: readCgroupField(cgroupPath, "memory.swap.peak"),
      },
      tuning: {
        nodeFlags: "--expose-gc --max-old-space-size=8192",
        note:
          "V8 --max-old-space-size=8192 is required so the old space can use the 8 GiB cgroup; " +
          "default heap limits abort the resident ramp early. Disclose this when comparing. " +
          "Ask Infinity whether a fair operator would set an analogous allocator knob " +
          "(jemalloc/mimalloc, glibc MALLOC_*, arena sizing) — agent_scale today uses " +
          "glibc malloc + malloc_trim(0) with no extra env.",
      },
      protocol: {
        baselineAgents,
        lastFitTarget,
        step,
        probeSample,
        ceilingMultiple,
        probeTurns,
        probeEverySteps,
      },
      baseline: baseline!,
      atLastFit,
      checkpoints,
      highestNWithin2x,
      highestContiguousNWithin2x,
      peakMemKiBPerAgentAtLastFit,
      rssKiBPerAgentAtLastFit,
      lastFitAgents,
      oomOrAbort,
      reading,
    } satisfies FitLatencyEvidence;
  });
}

export function writeFitLatencyEvidenceEffect(
  evidence: FitLatencyEvidence,
  path: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return path;
  });
}

/** Partial checkpoint dump so SIGKILL still leaves a usable evidence file. */
export function writeFitLatencyPartialEffect(
  path: string,
  partial: Record<string, unknown>
): Effect.Effect<string> {
  return Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ kind: "clawql-resident-8g-fit-latency-v1-partial", ...partial }, null, 2)}\n`,
      "utf8"
    );
    return path;
  });
}

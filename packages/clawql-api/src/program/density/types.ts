/**
 * Durable-agent density — fair cross-system comparison contract types.
 *
 * Same agent + same columns on one host. Distinct from Ready-process RSS
 * (memory-plateau / Bun host boards). See docs/benchmarks/program-density/.
 */

/** v2: every parked agent has a wake deadline; systems must fire it on time. */
export const FAIR_CONTRACT_ID = "durable-agent-density-fair-v2" as const;

/**
 * Fair parked agent: 20 turn pairs + one pending tool, waiting on that tool,
 * with a wake deadline (approval expiry / reminder) randomly spread.
 */
export type FairParkedAgent = {
  readonly agentId: string;
  readonly version: 2;
  readonly status: "parked";
  readonly turns: readonly FairTurn[];
  readonly pendingTool: FairPendingTool;
  readonly parkedAt: string;
  /** ISO wake deadline — must be scheduled in-process and fired on time. */
  readonly wakeDeadlineAt: string;
};

export type FairTurn = {
  readonly i: number;
  readonly role: "user" | "assistant";
  readonly text: string;
};

export type FairPendingTool = {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly approvalId: string;
};

/** Which resource exhausted first at agents-at-limit. */
export type LimitResource = "disk" | "rss" | "latency" | "none";

export type LatencyPair = {
  readonly p50: number;
  readonly p99: number;
};

/** Board columns every system must publish. */
export type BoardColumns = {
  readonly agentsAtLimit: number;
  /** First resource that ran out at that N (disk | rss | latency). */
  readonly limitResource: LimitResource;
  /**
   * Total process RSS / agents (KiB) — same RSS ceiling definition as Ontologiql
   * (total process RSS, not RSS-delta).
   */
  readonly residentKiBPerAgent: number;
  /** Reclaimable OS page-cache hold of offloaded pages (KiB per agent), or null if unmeasured. */
  readonly pageCacheKiBPerAgent: number | null;
  /** Where parked state lives (bytes per agent on disk / object store). */
  readonly diskBytesPerAgent: number;
  readonly wakeWarmMs: LatencyPair;
  readonly wakeColdMs: LatencyPair;
  /**
   * Shared deadline SLA (default 1000 ms): % met + p99 excess-over-tick under
   * steady and burst, with declared arrival rate and sustainable throughput.
   * Null until measured. Scheduler tick/mechanism/firedDefinition live in
   * clawqlRun.deadlineAccuracy — not a poll-interval artifact.
   */
  readonly deadlineAccuracy: DeadlineBoardAccuracy | null;
  readonly restartSurvival: boolean;
};

/**
 * Board-facing deadline accuracy (same SLA + fired definition for every system).
 * Comparable headline = sustainablePerSec (max steady arrival rate with
 * ≥slaTargetPct within slaMs).
 */
export type DeadlineBoardAccuracy = {
  readonly slaMs: number;
  readonly slaTargetPct: number;
  /** Must match across systems: durable trigger record vs bag wake. */
  readonly firedDefinition: "durable_trigger_record" | "bag_wake";
  readonly concurrency: number;
  /**
   * Flush policy for durable_trigger_record (must match across systems, or
   * each row discloses its own). Null for bag_wake.
   */
  readonly flushPolicy: {
    readonly mode: "os_buffer" | "fsync_each" | "group_commit";
    readonly batchMax: number | null;
    readonly flushIntervalMs: number | null;
    readonly durabilityWindowTriggers: number | null;
    readonly durabilityWindowMs: number | null;
    readonly crashSafe: boolean;
    readonly syncPrimitive: string;
  } | null;
  /** Crash-recovery proof: every counted fire present on disk after SIGKILL. */
  readonly crashTestOk: boolean | null;
  /** Offered deadlines/sec in the steady showcase arm. */
  readonly steadyArrivalRatePerSec: number;
  readonly steadyPctMet: number;
  /** p99 of max(0, lateness − tickMs) under spread deadlines. */
  readonly steadyP99ExcessMs: number;
  readonly burstPctMet: number;
  /** p99 excess-over-tick when thousands share one deadline instant. */
  readonly burstP99ExcessMs: number;
  /** Burst drain throughput (fires/sec) — capacity signal, not offered rate. */
  readonly burstDrainPerSec: number;
  /** Max steady arrival rate that still met slaTargetPct within slaMs. */
  readonly sustainablePerSec: number;
};

export type DensitySystemId = "ontologiql-rust" | "clawql-typescript" | "golem" | "infinity";

export type DensityRowStatus =
  "measured" | "publishable" | "pending_invite" | "not_run" | "lab_only" | "methodology_pending";

export type DensitySystemRow = {
  readonly systemId: DensitySystemId;
  readonly status: DensityRowStatus;
  readonly hostLabel: string;
  readonly honesty: string;
  readonly boardColumns: BoardColumns | null;
  /** Lab-only active pulse — must not be quoted in the public parked claim. */
  readonly activeDensityLab?: Readonly<Record<string, unknown>> | null;
};

export type WakeLatency = {
  readonly p50: number;
  readonly p99: number;
  readonly n: number;
};

export type GcPauseSummary = {
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
};

export type WakeOrderId = "warm_then_cold" | "cold_then_warm";

export type WakeOrderResult = {
  readonly order: WakeOrderId;
  readonly repetition: number;
  readonly warm: WakeLatency;
  readonly cold: WakeLatency;
  readonly gcWarm: GcPauseSummary;
  readonly gcCold: GcPauseSummary;
};

export type WakeSpread = {
  readonly order: WakeOrderId;
  readonly coldP99Min: number;
  readonly coldP99Max: number;
  readonly coldP99Median: number;
  readonly warmP99Min: number;
  readonly warmP99Max: number;
  readonly warmP99Median: number;
  readonly repetitions: number;
};

export type HeapSnapshot = {
  readonly rssKiB: number;
  readonly heapUsedKiB: number;
  readonly heapTotalKiB: number;
  readonly externalKiB: number;
  readonly arrayBuffersKiB: number;
};

export type ResidentAccounting = {
  /** Total process RSS / N (board column definition; matches Ontologiql ceiling). */
  readonly totalRssKiBPerAgent: number;
  /** heapUsed after forced GC / N — GC-runtime check on RSS. */
  readonly heapUsedKiBPerAgentAfterGc: number;
  /** RSS-delta vs empty process / N — diagnostic only; not the board ceiling. */
  readonly rssDeltaKiBPerAgent: number;
  /**
   * Working-system in-process state at limit: wake-deadline schedule entries
   * (agentId + deadlineMs). Bag path is derived from agentId — not stored.
   * Index-only retention is insufficient for the v2 approval-deadline contract.
   */
  readonly retainedInProcess: string;
  /** Must equal agentsAtLimit for a comparable capacity claim. */
  readonly deadlineScheduleEntries: number;
  readonly scheduleShape: "deadline_min_heap";
  readonly estimatedScheduleBytesPerAgent: number;
};

export type EvidenceFair = {
  readonly kind: typeof FAIR_CONTRACT_ID;
  readonly measuredAt: string;
  readonly contract: {
    readonly agent: {
      readonly turns: number;
      readonly turnPairBytesTarget: string;
      readonly pendingToolBytesTarget: string;
      readonly park: string;
      readonly offload: string;
      readonly wakeDeadline: string;
    };
    readonly columns: readonly string[];
    readonly memoryFraming: string;
    readonly publicClaimScope: string;
    /** Shared definitions that must match across systems before comparison. */
    readonly definitions: {
      readonly rssCeiling: "total_process_rss";
      /** First resource exhausted: disk, rss, or latency target. */
      readonly agentsAtLimit: "first_resource_exhausted";
      /** In-process state required at limit. */
      readonly retainedAtLimit: "wake_deadline_schedule";
    };
  };
  readonly host: {
    readonly label: string;
    readonly hostname: string;
    readonly platform: string;
    readonly arch: string;
    readonly nodeVersion: string;
    readonly cpus: number;
    readonly memTotalKiB: number;
    readonly rssCeilingMiB: number;
  };
  readonly rows: readonly DensitySystemRow[];
  /** The ClawQL TypeScript run that produced this file (when measured here). */
  readonly clawqlRun?: {
    readonly bagDir: string;
    readonly ramp: readonly FairRampStep[];
    readonly wakeSampleSize: number;
    readonly wakeWarmupCount: number;
    readonly wakeOrderRepetitions: number;
    readonly deadlineHorizonMs: number;
    readonly deadlineMaxFires: number;
    readonly deadlineSlaMs: number;
    readonly coldEviction: string;
    readonly limitReason: string;
    readonly limitHit: boolean;
    readonly limitResource: LimitResource;
    readonly rssCeilingDefinition: "total_process_rss";
    readonly baseline: HeapSnapshot;
    readonly atLimit: HeapSnapshot;
    readonly residentAccounting: ResidentAccounting;
    /** True when the limit run retained a deadline schedule for every counted agent. */
    readonly deadlineScheduleRetainedAtLimit: boolean;
    /**
     * Full deadline accuracy report: scheduler tick/mechanism, fired definition,
     * steady + burst + ramp arms, arrival rates, sustainable throughput.
     */
    readonly deadlineAccuracy: {
      readonly slaMs: number;
      readonly slaTargetPct: number;
      readonly scheduler: {
        readonly mechanism: string;
        readonly nextDeadlineComplexity: string;
        readonly tickMs: number;
        readonly concurrency: number;
        readonly firedDefinition: "durable_trigger_record" | "bag_wake";
        readonly flushPolicy: {
          readonly mode: string;
          readonly batchMax: number | null;
          readonly flushIntervalMs: number | null;
          readonly durabilityWindowTriggers: number | null;
          readonly durabilityWindowMs: number | null;
          readonly crashSafe: boolean;
          readonly storage: string;
          readonly syncPrimitive: string;
          readonly note: string;
        } | null;
        readonly note: string;
      };
      readonly steady: {
        readonly mode: "steady" | "burst" | "ramp";
        readonly n: number;
        readonly fired: number;
        readonly arrivalRatePerSec: number;
        readonly pctWithinSla: number;
        readonly latenessP50Ms: number;
        readonly latenessP99Ms: number;
        readonly excessOverTickP50Ms: number;
        readonly excessOverTickP99Ms: number;
        readonly maxLatenessMs: number;
        readonly maxExcessOverTickMs: number;
        readonly wallMs: number;
      };
      readonly burst: {
        readonly mode: "steady" | "burst" | "ramp";
        readonly n: number;
        readonly fired: number;
        readonly arrivalRatePerSec: number;
        readonly pctWithinSla: number;
        readonly latenessP50Ms: number;
        readonly latenessP99Ms: number;
        readonly excessOverTickP50Ms: number;
        readonly excessOverTickP99Ms: number;
        readonly maxLatenessMs: number;
        readonly maxExcessOverTickMs: number;
        readonly wallMs: number;
      };
      readonly sustainablePerSec: number;
      readonly ramp: readonly {
        readonly mode: "steady" | "burst" | "ramp";
        readonly n: number;
        readonly fired: number;
        readonly arrivalRatePerSec: number;
        readonly pctWithinSla: number;
        readonly latenessP99Ms: number;
        readonly excessOverTickP99Ms: number;
        readonly wallMs: number;
      }[];
      readonly crashTest: {
        readonly ok: boolean;
        readonly countedFired: number;
        readonly recoveredOnDisk: number;
        readonly missingFromDisk: number;
        readonly duplicateOnDisk: number;
        readonly note: string;
      } | null;
    } | null;
    readonly wakeByOrder: readonly WakeOrderResult[];
    readonly wakeSpread: readonly WakeSpread[];
    /** Headline warm columns use slower-cold order; cold quote median+range from wakeSpread. */
    readonly wakeHeadlineOrder: WakeOrderId;
    readonly wakePooled: {
      readonly warm: WakeLatency;
      readonly cold: WakeLatency;
      readonly coldFasterThanWarmP99: boolean;
    };
    readonly exposeGc: boolean;
    /** @deprecated use limitHit */
    readonly ceilingHit: boolean;
  };
};

export type FairRampStep = {
  readonly agents: number;
  readonly rssKiB: number;
  /** total process RSS / agents */
  readonly residentKiBPerAgent: number;
  readonly rssDeltaKiBPerAgent: number;
  readonly heapUsedKiBAfterGc: number;
  readonly heapUsedKiBPerAgentAfterGc: number;
  readonly diskBytesTotal: number;
  readonly diskBytesPerAgent: number;
  readonly diskAvailBytes: number | null;
  readonly pageCacheKiBPerAgent: number | null;
  readonly withinRssCeiling: boolean;
};

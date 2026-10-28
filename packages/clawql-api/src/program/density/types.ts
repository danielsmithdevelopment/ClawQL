/**
 * Durable-agent density — fair cross-system comparison contract types.
 *
 * Same agent + same columns on one host. Distinct from Ready-process RSS
 * (memory-plateau / Bun host boards). See docs/benchmarks/program-density/.
 */

export const FAIR_CONTRACT_ID = "durable-agent-density-fair-v1" as const;

/** Fair parked agent: 20 turn pairs + one pending tool, waiting on that tool. */
export type FairParkedAgent = {
  readonly agentId: string;
  readonly version: 1;
  readonly status: "parked";
  readonly turns: readonly FairTurn[];
  readonly pendingTool: FairPendingTool;
  readonly parkedAt: string;
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

/** Board columns every system must publish. */
export type BoardColumns = {
  readonly agentsAtLimit: number;
  /** Process RSS — hard cost (KiB per parked agent). */
  readonly residentKiBPerAgent: number;
  /** Reclaimable OS page-cache hold of offloaded pages (KiB per agent), or null if unmeasured. */
  readonly pageCacheKiBPerAgent: number | null;
  /** Where parked state lives (bytes per agent on disk / object store). */
  readonly diskBytesPerAgent: number;
  readonly wakeWarmMs: { readonly p50: number; readonly p99: number };
  readonly wakeColdMs: { readonly p50: number; readonly p99: number };
  readonly restartSurvival: boolean;
};

export type DensitySystemId = "ontologiql-rust" | "clawql-typescript" | "golem" | "infinity";

export type DensityRowStatus =
  | "measured"
  | "publishable"
  | "pending_invite"
  | "not_run"
  | "lab_only";

export type DensitySystemRow = {
  readonly systemId: DensitySystemId;
  readonly status: DensityRowStatus;
  readonly hostLabel: string;
  readonly honesty: string;
  readonly boardColumns: BoardColumns | null;
  /** Lab-only active pulse — must not be quoted in the public parked claim. */
  readonly activeDensityLab?: Readonly<Record<string, unknown>> | null;
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
    };
    readonly columns: readonly string[];
    readonly memoryFraming: string;
    readonly publicClaimScope: string;
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
    readonly coldEviction: string;
    readonly limitReason: string;
  };
};

export type FairRampStep = {
  readonly agents: number;
  readonly rssKiB: number;
  readonly residentKiBPerAgent: number;
  readonly diskBytesTotal: number;
  readonly diskBytesPerAgent: number;
  readonly pageCacheKiBPerAgent: number | null;
  readonly withinRssCeiling: boolean;
};

/**
 * Training pipeline contracts (spec v0.1).
 * @see docs/inference/clawql-inference-training-pipeline.md
 */

export type AdapterMethod = "qlora" | "lora" | "full";
export type DpoVariant = "standard" | "ipo" | "kto" | "orpo";
export type GpuType = "h100" | "a100" | "rtx5090" | "auto";
export type EvalBenchmark = "openbench-b7" | "harvey-lab-firm-knowledge" | "none";

export type RewardScore = {
  score: number;
  breakdown: Record<string, unknown>;
};

export type GrpoTask = {
  taskId: string;
  taskMeta: {
    criteria?: unknown[];
    documents?: unknown;
    groundTruth?: { matterIds?: string[]; [key: string]: unknown };
    [key: string]: unknown;
  };
};

export type RewardFunction = {
  id: string;
  description?: string;
  score: (rollout: string, task: GrpoTask) => Promise<RewardScore>;
};

export type TrainingMethod =
  | { type: "sft" }
  | { type: "dpo"; variant: DpoVariant; beta: number }
  | {
      type: "grpo";
      rewardFunctions: RewardFunction[];
      numRollouts: number;
      rolloutServer: string;
      rolloutModel: string;
    }
  | { type: "rlhf"; rewardModelPath?: string; ppoEpochs: number }
  | {
      type: "constitutional";
      critiquePrompt: string;
      revisionPrompt: string;
      principleSet: string[];
    }
  | { type: "spin"; previousModelPath: string; spinRound: number };

export type TraceFilter = {
  minCriterionPassRate?: number;
  maxCriterionPassRate?: number;
  requireAllPass?: boolean;
  requireToolEvidence?: string[];
  minTurns?: number;
  maxTurns?: number;
  benchmarkId?: string;
  domain?: string;
  taskFamily?: string;
  arm?: string;
  model?: string;
  after?: string;
  before?: string;
  requirePairs?: boolean;
  /** Drop DPO pairs whose length ratio exceeds this (default 2.0). */
  maxChosenRejectedRatio?: number;
};

export type TrainingConfig = {
  runId: string;
  description: string;
  baseModel: string;
  adapterMethod: AdapterMethod;
  loraRank?: number;
  loraAlpha?: number;
  loraTargetModules?: string[];
  method: TrainingMethod;
  dataSource: {
    bucket: string;
    prefix?: string;
    filter: TraceFilter;
    splitRatio: number;
    maxSamples?: number;
  };
  gpuConfig: {
    gpuType: GpuType;
    gpuCount: number;
    vramBudgetGB?: number;
  };
  hyperparams: {
    epochs: number;
    batchSize: number;
    gradientAccumulationSteps: number;
    learningRate: number;
    warmupSteps?: number;
    maxSeqLen: number;
    packSequences: boolean;
  };
  outputPath: string;
  pushToHub?: string;
  evalAfterTraining: boolean;
  evalBenchmark: EvalBenchmark;
  evalPassThreshold: number;
  autoPromote: boolean;
  domain: string;
  adapterVersion: string;
};

/** Minimal OBT / RTP shape used by the formatter. */
export type RtpTurn = {
  intent?: { rawPrompt?: string };
  reasoning?: { seedChain?: string };
  execution?: {
    toolName?: string;
    payload?: unknown;
    result?: unknown;
  };
};

export type ObtRecord = {
  task_id: string;
  benchmark?: string;
  arm?: string;
  model?: string;
  documents?: unknown;
  harveyRubric?: {
    criteria?: unknown[];
    groundTruth?: { matterIds?: string[]; [key: string]: unknown };
  };
  rtp: {
    verdict: {
      criterionPassRate: number;
      allPass?: boolean;
    };
    turnSequence: RtpTurn[];
  };
};

export type SftExample = { prompt: string; response: string };
export type DpoExample = {
  prompt: string;
  chosen: string;
  rejected: string;
  chosenCPR?: number;
  rejectedCPR?: number;
  taskId?: string;
  benchmark?: string;
};
export type KtoExample = {
  prompt: string;
  completion: string;
  label: "good" | "bad";
};
export type GrpoExample = {
  prompt: string;
  taskId: string;
  taskMeta: GrpoTask["taskMeta"];
};

export type DomainAdapterRecord = {
  path: string;
  baseModel: string;
  trainedOn?: Record<string, unknown>;
  evalResults?: Record<string, unknown>;
  promotedAt?: string;
  clawqlVersion?: string;
  manifestId?: string;
  previousPath?: string;
};

export type DomainAdapterTierMap = {
  frugal?: {
    base?: string;
    adapters?: Record<string, DomainAdapterRecord | null>;
  };
  standard?: { base?: string; adapters?: Record<string, DomainAdapterRecord | null> };
  frontier?: { base?: string; adapters?: Record<string, DomainAdapterRecord | null> };
};

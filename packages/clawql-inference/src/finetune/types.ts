import type { ModelTier } from "../routing/types.js";

export type FinetuneProvider = "openai" | "anthropic";

export type FinetuneJobStatus =
  | "validating_files"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type FinetuneJob = {
  id: string;
  provider: FinetuneProvider;
  status: FinetuneJobStatus;
  baseModel: string;
  fineTunedModel?: string;
  createdAt: string;
  finishedAt?: string;
  error?: string;
};

export type SubmitFinetuneJobInput = {
  datasetPath: string;
  manifestPath?: string;
  baseModel: string;
  provider: FinetuneProvider;
  registerAs?: string;
  suffix?: string;
  env?: NodeJS.ProcessEnv;
};

export type RegisterFinetuneModelInput = {
  jobId: string;
  tier: ModelTier;
  alias: string;
  env?: NodeJS.ProcessEnv;
};

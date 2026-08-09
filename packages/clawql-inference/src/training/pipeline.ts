import { buildTrainingWorkflow, scheduleTrainingRun } from "./scheduler.js";
import type { TrainingConfig } from "./types.js";

export type TrainingRunHandle = {
  runId: string;
  workflowName: string;
  status: "submitted" | "local-dry-run";
};

/** Orchestrate a training run (Argo when configured; otherwise dry-run workflow name). */
export async function runTrainingPipeline(config: TrainingConfig): Promise<TrainingRunHandle> {
  const workflow = buildTrainingWorkflow(config);
  const name = await scheduleTrainingRun(config);
  const argoConfigured = Boolean(process.env.CLAWQL_ARGO_ENDPOINT?.trim());
  return {
    runId: config.runId,
    workflowName: name || workflow.metadata.name,
    status: argoConfigured ? "submitted" : "local-dry-run",
  };
}

export function defaultHyperparams(): TrainingConfig["hyperparams"] {
  return {
    epochs: 3,
    batchSize: 4,
    gradientAccumulationSteps: 4,
    learningRate: 2e-4,
    maxSeqLen: 8192,
    packSequences: true,
  };
}

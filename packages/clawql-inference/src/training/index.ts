/**
 * clawql-inference training pipeline (spec v0.1 scaffold).
 * @see docs/inference/clawql-inference-training-pipeline.md
 */

export type * from "./types.js";
export { TraceFormatter, formatForMethod } from "./data/formatter.js";
export { filterTraces, hasToolEvidenceInTrace } from "./data/filter.js";
export { collectTraces } from "./data/collector.js";
export {
  harveyLabReward,
  createHarveyLabReward,
  defaultHarveyEvalRunner,
} from "./rewards/harvey.js";
export { mattersFoundReward } from "./rewards/matters_found.js";
export { compositeReward, toolUsageReward, harveyWithToolReward } from "./rewards/composite.js";
export { buildTrainingWorkflow, scheduleTrainingRun } from "./scheduler.js";
export { runTrainingPipeline, defaultHyperparams } from "./pipeline.js";
export {
  resolveDomainAdapterMapPath,
  loadDomainAdapterMap,
  saveDomainAdapterMap,
  promoteDomainAdapter,
  rollbackDomainAdapter,
  listDomainAdapters,
} from "./registry.js";
export { gatePromotion } from "./evaluator.js";
export { defaultQLoRAConfig } from "./adapters/qlora.js";
export { defaultLoRAConfig } from "./adapters/lora.js";
export { defaultFullFinetuneConfig } from "./adapters/full.js";

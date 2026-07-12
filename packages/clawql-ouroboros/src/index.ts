export {
  SeedSchema,
  SeedMetadataSchema,
  OntologyFieldSchema,
  OntologySchemaSchema,
  BrownfieldContextSchema,
  EvaluationPrincipleSchema,
  ExitConditionSchema,
} from "./seed.js";
export type { Seed, OntologyField, OntologySchema } from "./seed.js";

export type {
  OntologyLineage,
  GenerationRecord,
  GenerationPhase,
  EvaluationSummary,
  ACResult,
  DriftSummary,
  ConvergenceSummary,
} from "./lineage.js";

export type {
  EventStore,
  StoredEvent,
  WonderEngine,
  WonderOutput,
  ReflectEngine,
  ReflectOutput,
  Executor,
  Evaluator,
} from "./interfaces.js";

export { ConvergenceCriteria, RegressionDetector } from "./convergence.js";
export type {
  ConvergenceSignal,
  ConvergenceConfig,
  ConvergenceReasonCode,
  RegressionResult,
} from "./convergence.js";

export {
  measureDrift,
  classifyDriftBand,
  driftReportPayload,
  DRIFT_WEIGHTS,
  DRIFT_THRESHOLD_ACCEPTABLE,
  DRIFT_THRESHOLD_EXCELLENT,
} from "./drift.js";
export type { DriftReport, DriftBand, DriftComponents, MeasureDriftInput } from "./drift.js";

export { EvolutionaryLoop } from "./evolutionary-loop.js";
export type { LoopResult, GenerationSnapshot } from "./evolutionary-loop.js";

export { InMemoryEventStore } from "./in-memory-event-store.js";

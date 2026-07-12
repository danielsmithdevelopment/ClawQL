export type {
  ModelTierMap,
  ModelTier,
  RoutingFailureKind,
  RoutingFailureSignal,
  ModelEscalationDecision,
  AdaptiveRouter,
} from "./routing/types.js";

export {
  MODEL_TIER_ORDER,
  nextModelTier,
  loadModelEscalationConfig,
  createModelEscalationRouter,
  TierEscalationRouter,
  type ModelEscalationConfig,
} from "./routing/index.js";

export type {
  ChatRole,
  ChatMessage,
  InferenceRequest,
  InferenceResponse,
  InferenceUsage,
  InferenceGateway,
} from "./gateway.js";

export { UnconfiguredInferenceGateway } from "./gateway.js";

/** Optional context passed to host engines (Wonder / Reflect / Execute). */
export interface EngineCallContext {
  seedId: string;
  generationNumber: number;
  routing?: import("./routing/types.js").ModelEscalationDecision;
}

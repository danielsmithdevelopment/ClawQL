export type {
  ModelTierMap,
  ModelTier,
  RoutingFailureKind,
  RoutingFailureSignal,
  PalRoutingDecision,
  AdaptiveRouter,
} from "./routing/types.js";

export {
  PAL_TIER_ORDER,
  nextPalTier,
  loadPalRoutingConfig,
  createAdaptiveRouter,
  PalAdaptiveRouter,
  type PalRoutingRuntimeConfig,
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
  routing?: import("./routing/types.js").PalRoutingDecision;
}

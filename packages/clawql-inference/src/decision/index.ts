export {
  DecisionGatewayService,
  DecisionGatewayLive,
  PRODUCTION_TRUSTED_USE_SITES,
  runDecision,
  useHeuristicDecisionStackForTests,
  resetDecisionRuntime,
  type DecisionAnswer,
  type DecisionChoiceOption,
  type DecisionChoiceQuestion,
  type DecisionEscalationMode,
  type DecisionNoulQuestion,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResponse,
  type DecisionScoreLevel,
  type DecisionScoreQuestion,
} from "./service.js";

export { createDecisionRouter, type CreateDecisionRouterOptions } from "./router.js";

export {
  parseOpenAiDecisionBody,
  toOpenAiDecisionResponse,
  isLunaModelId,
  isMicrosoftDecision1ModelId,
  extractTextAndImages,
} from "./openai-adapt.js";

export type {
  OpenAiDecisionCreateRequest,
  OpenAiDecisionCreateResponse,
  OpenAiDecisionAnswer,
  OpenAiDecisionQuestion,
} from "./openai-types.js";

export {
  callRemoteOpenAiDecisions,
  enrichRemoteWithClawql,
  remoteLunaAvailable,
} from "./remote-decisions.js";

export {
  OpenRouterDecisionsService,
  OpenRouterDecisionsLive,
  makeOpenRouterDecisionsLive,
  callRemoteOpenRouterDecisions,
  remoteOpenRouterDecisionsAvailable,
  resolveOpenRouterDecisionsModel,
  isOpenRouterDecisionBackendId,
  DEFAULT_OPENROUTER_DECISIONS_MODEL,
  type CallOpenRouterDecisionsOptions,
} from "./remote-openrouter-decisions.js";

export {
  DecisionsPolicyService,
  DecisionsPolicyLive,
  LOCAL_DECISION_MODELS,
  classifyDecisionsModel,
  allowUncalibratedAnswers,
  allowExternalImageEgress,
  refusalsForFailClosed,
  type DecisionsModelKind,
  type RefusalAnswer,
} from "./policy.js";

export {
  FanoutEvalService,
  FanoutEvalLive,
  makeFanoutEvalLive,
  runFanoutEval,
  parseFanoutEvalBody,
  resolveFanoutCostPerCase,
  spendCostsFromRows,
  type FanoutEvalRequest,
  type FanoutEvalResponse,
  type FanoutBackendReport,
} from "./fanout-eval.js";

export {
  FanoutSpendCostService,
  FanoutSpendCostLive,
  buildSpendCostLookup,
  costPerCallFromSpendRow,
  lookupSpendCostPerCase,
  type FanoutCostSource,
} from "./spend-cost.js";

export {
  FlipRateGateService,
  FlipRateGateLive,
  makeFlipRateGateLive,
  runFlipRate,
  parseFlipRateBody,
  applyPerturbations,
  DEFAULT_FLIP_RATE_FAMILIES,
  type FlipRateRequest,
  type FlipRateResponse,
  type FlipRateFamily,
} from "./flip-rate.js";

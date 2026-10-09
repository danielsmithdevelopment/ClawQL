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

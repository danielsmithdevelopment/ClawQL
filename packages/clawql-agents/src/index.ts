export { clineMcpServerConfig, clineHookToWormAppend } from "./adapters/cline/worm-hooks.js";
export type { ClineHookEvent, ClineHookKind } from "./adapters/cline/worm-hooks.js";
export {
  appendClineHook,
  makeClineAdapterLayer,
  makeClineWormLayer,
} from "./adapters/cline/index.js";
export { CLINE_ATR_TEMPLATES } from "./adapters/cline/atr-templates.js";
export type { ClineAtrTemplateName } from "./adapters/cline/atr-templates.js";
export { buildClineMcpBridge } from "./adapters/cline/mcp-bridge.js";

export {
  appendOpenClawHook,
  gateOpenClawSkillInvoke,
  makeOpenClawAdapterLayer,
  makeOpenClawWormLayer,
} from "./adapters/openclaw/index.js";
export { OPENCLAW_ATR_TEMPLATES } from "./adapters/openclaw/atr-templates.js";
export type { OpenClawAtrTemplateName } from "./adapters/openclaw/atr-templates.js";
export { openClawHookToWormAppend } from "./adapters/openclaw/worm-hooks.js";
export type { OpenClawHookEvent, OpenClawHookKind } from "./adapters/openclaw/worm-hooks.js";
export {
  openClawMcpHttpConfig,
  planOpenClawSkillInjection,
} from "./adapters/openclaw/mcp-bridge.js";

export {
  appendHermesHook,
  makeHermesAdapterLayer,
  makeHermesWormLayer,
} from "./adapters/hermes/index.js";
export { HERMES_ATR_TEMPLATES } from "./adapters/hermes/atr-templates.js";
export type { HermesAtrTemplateName } from "./adapters/hermes/atr-templates.js";
export { hermesHookToWormAppend } from "./adapters/hermes/worm-hooks.js";
export type { HermesHookEvent, HermesHookKind } from "./adapters/hermes/worm-hooks.js";
export {
  HERMES_WORM_AGENT_MODULE,
  buildHermesMcpBridgeConfig,
  hermesRuntimeClassHint,
} from "./adapters/hermes/mcp-bridge.js";

export { getAdapterBundle } from "./get-adapter.js";
export {
  AgentAdapter,
  AgentAdapterLive,
  type AgentHealth,
  type AgentName,
  type AgentSession,
  type ATRScope,
  type AgentWormError,
  type ClawQLAgentConfig,
} from "./shared/types.js";
export {
  PanguardDenyError,
  assertToolInScope,
  enforceToolCall,
  isToolInScope,
  type PanguardEnforceError,
} from "./shared/panguard.js";
export { createAgentSession } from "./shared/session.js";
export { makeAgentWormLayer } from "./shared/worm.js";
export { TIER_CAPABILITIES, type RockYourLobsterTier, type TierCapabilities } from "./shared/tiers.js";
export {
  CORE_MCP_TOOLS,
  DEFAULT_MEMORY_TOOLS,
  SHIPPABLE_MCP_TOOLS,
} from "./shared/shippable-tools.js";

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
export {
  createTelegramReauthNotifier,
  createTelegramReauthNotifierFromEnv,
  type TelegramReauthNotifierOptions,
} from "./adapters/hermes/reauth-telegram.js";

export {
  appendGooseHook,
  makeGooseAdapterLayer,
  makeGooseWormLayer,
  GoosePathDenyError,
  gateGooseFileWrite,
  gooseHookToWormAppend,
  isPathInScope,
} from "./adapters/goose/index.js";
export { GOOSE_ATR_TEMPLATES } from "./adapters/goose/atr-templates.js";
export type { GooseAtrScope, GooseAtrTemplateName } from "./adapters/goose/atr-templates.js";
export type { GooseHookEvent, GooseHookKind } from "./adapters/goose/worm-hooks.js";
export { planGooseMcpToolRegistration } from "./adapters/goose/mcp-bridge.js";

export {
  appendOpenHandsHook,
  makeOpenHandsAdapterLayer,
  makeOpenHandsWormLayer,
} from "./adapters/openhands/index.js";
export { OPENHANDS_ATR_TEMPLATES } from "./adapters/openhands/atr-templates.js";
export type { OpenHandsAtrTemplateName } from "./adapters/openhands/atr-templates.js";
export { openHandsHookToWormAppend } from "./adapters/openhands/worm-hooks.js";
export type { OpenHandsHookEvent, OpenHandsHookKind } from "./adapters/openhands/worm-hooks.js";
export {
  BudgetExhaustedError,
  makeOpenHandsBudgetEnforcer,
} from "./adapters/openhands/budget-enforcer.js";
export { planOpenHandsMcpInjection } from "./adapters/openhands/mcp-bridge.js";

export { appendPiHook, makePiAdapterLayer, makePiWormLayer } from "./adapters/pi/index.js";
export { PI_ATR_TEMPLATES } from "./adapters/pi/atr-templates.js";
export type { PiAtrTemplateName } from "./adapters/pi/atr-templates.js";
export { piHookToWormAppend } from "./adapters/pi/worm-hooks.js";
export type { PiHookEvent, PiHookKind } from "./adapters/pi/worm-hooks.js";
export { buildPiSessionMemoryPlan } from "./adapters/pi/mcp-bridge.js";

export {
  appendDeepSeekHook,
  makeDeepSeekAdapterLayer,
  makeDeepSeekWormLayer,
  DeepSeekPluginDenyError,
  gateDeepSeekPluginLoad,
  deepSeekHookToWormAppend,
} from "./adapters/deepseek/index.js";
export { DEEPSEEK_ATR_TEMPLATES } from "./adapters/deepseek/atr-templates.js";
export type {
  DeepSeekAtrScope,
  DeepSeekAtrTemplateName,
} from "./adapters/deepseek/atr-templates.js";
export type { DeepSeekHookEvent, DeepSeekHookKind } from "./adapters/deepseek/worm-hooks.js";
export { planDeepSeekMcpRegistration } from "./adapters/deepseek/mcp-bridge.js";

export { getAdapterBundle, IMPLEMENTED_AGENTS } from "./get-adapter.js";
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
export {
  TIER_CAPABILITIES,
  type RockYourLobsterTier,
  type TierCapabilities,
} from "./shared/tiers.js";
export {
  CORE_MCP_TOOLS,
  DEFAULT_MEMORY_TOOLS,
  SHIPPABLE_MCP_TOOLS,
} from "./shared/shippable-tools.js";

export {
  buildOpenClawMcpSetHttpJson,
  buildOpenClawMcpSetStdioJson,
  formatOpenClawMcpSetCommands,
  planOpenClawLiveWiring,
} from "./adapters/openclaw/live-mcp.js";

export {
  installPersonalAgentHooks,
  planPersonalAgentInstall,
  CLINE_WORM_HOOK_STUB,
} from "./personal/install.js";
export type { PersonalAgentInstallPaths, PersonalAgentInstallPlan } from "./personal/install.js";

export { getOutboundCredential, OutboundCredentialError } from "./auth/outbound-credential.js";
export type { GetOutboundCredentialInput, OutboundCredential } from "./auth/outbound-credential.js";

export { runAgentBenchmarkDry, catalogAgentsForBench } from "./bench/dry-runner.js";
export type {
  ArmResult,
  BenchmarkFamily,
  BenchmarkScorecard,
  BenchmarkTask,
  TaskResult,
} from "./bench/dry-runner.js";

export {
  FAMILY_S_STUB_TOOLS,
  FAMILY_S_STUB_TOOL_NAMES,
  FAMILY_S_READONLY_ATR,
  isFamilySStubTool,
  getFamilySStubTool,
} from "./bench/family-s-stub-catalog.js";
export type { FamilySStubTool, FamilySStubToolKind } from "./bench/family-s-stub-catalog.js";

export { runFamilySScopeChecks, invokeHarnessStub } from "./bench/family-s-checks.js";
export type {
  FamilySCheckDetail,
  FamilySCheckName,
  FamilySCheckReport,
  InvokeHarnessStubResult,
} from "./bench/family-s-checks.js";

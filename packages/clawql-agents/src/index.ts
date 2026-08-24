export { clineMcpServerConfig, clineHookToWormAppend } from "./adapters/cline/worm-hooks.js";
export type { ClineHookEvent, ClineHookKind } from "./adapters/cline/worm-hooks.js";
export {
  appendClineHook,
  makeClineAdapterLayer,
  makeClineWormLayer,
} from "./adapters/cline/index.js";
export {
  AgentAdapter,
  AgentAdapterLive,
  type AgentHealth,
  type AgentName,
  type AgentSession,
  type ATRScope,
  type AgentWormError,
} from "./shared/types.js";

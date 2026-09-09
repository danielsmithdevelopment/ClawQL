export type {
  AgentInstanceRecord,
  AgentInstanceStatus,
  PersistentAgentType,
  RegisterAgentInstanceInput,
} from "./types.js";
export {
  AGENT_HEARTBEAT_INTERVAL_MS,
  AGENT_IDLE_AFTER_MISSED,
  AGENT_OFFLINE_AFTER_MISSED,
  PERSISTENT_AGENT_TYPES,
  isPersistentAgentType,
} from "./types.js";
export {
  AgentInstanceRegistryService,
  agentInstanceRegistryLiveLayer,
  agentInstanceRegistryMemoryLayer,
  agentInstanceRegistryPath,
  statusFromLastActive,
  type AgentInstanceRegistryFile,
} from "./agent-instance-registry-service.js";
export {
  registerAgentInstanceOnStart,
  heartbeatAgentInstanceOnHealth,
  type RegistrySessionHints,
} from "./adapter-hooks.js";
export {
  AGENT_REGISTRY_MISSING_PARENT_GATEWAY_WARNING,
  warnIfAgentRegistryMissingParentGateway,
  resetAgentRegistryParentWarningsForTests,
} from "./registry-startup-warnings.js";

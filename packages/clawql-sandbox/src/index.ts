export {
  handleClawqlCodeToolInput,
  callSandboxBridge,
  type SandboxBridgeResponse,
  type SandboxCodeToolInput,
  type SandboxLanguage,
  type SandboxPersistenceMode,
  type SandboxExecBackendKind,
} from "./bridge-client.js";

export {
  parseExplicitSandboxBackendEnv,
  resolveSandboxBackendChoice,
  SANDBOX_AUTO_NONE_ERROR,
  type ExplicitSandboxBackend,
  type SandboxBackendAutoDeps,
} from "./backend-selection.js";

export {
  callKataSandbox,
  createInClusterKataClient,
  inKubernetesCluster,
  kataRuntimeClassName,
  kataSandboxEnabled,
  kataSandboxNamespace,
} from "./kata-kubernetes.js";

export {
  callAgentSubstrateSandbox,
  agentSubstrateConfigured,
  readAgentSubstrateConfig,
  AgentSubstrateService,
  AgentSubstrateWormSink,
  InMemoryAgentSubstrateWormSinkLive,
  createMockAgentSubstrateLayer,
  type AgentSubstrateConfig,
  type AgentSubstrateRuntime,
} from "./agent-substrate/index.js";

export {
  classifyIsolationWorkload,
  IsolationDecisionService,
  IsolationDecisionLive,
  ISOLATION_DECISION_EXAMPLES,
  type IsolationDecision,
  type IsolationDecisionInput,
  type IsolationHostKind,
  type IsolationWorkloadClass,
} from "./isolation-decision.js";

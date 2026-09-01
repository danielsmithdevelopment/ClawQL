export {
  ClawQLHarness,
  createClawQLHarness,
  type ClawQLHarness as ClawQLHarnessHandle,
} from "./harness.js";
export {
  buildHarnessContext,
  isToolInHarnessScope,
  makeHarnessWormLayer,
  registerHarnessPlugins,
  runLoopHandlers,
  teardownHarnessPlugins,
  type HarnessRegistryState,
} from "./registry.js";
export {
  harnessToolNamesForMcpBridge,
  invokeHarnessTool,
  listHarnessTools,
} from "./tool-bridge.js";
export { verifyHarnessWormTrail } from "./worm-bridge.js";
export {
  HarnessNotStartedError,
  HarnessPluginError,
  type BenchmarkTask,
  type ClawQLHarnessConfig,
  type HarnessComparisonArm,
  type HarnessComparisonResult,
  type HarnessContext,
  type HarnessPlugin,
  type HarnessRunResult,
  type HarnessScope,
  type HarnessTask,
  type HarnessTool,
  type LoopHandler,
  type LoopHistoryEntry,
  type LoopPhase,
  type LoopState,
  type ModelConfig,
} from "./types.js";

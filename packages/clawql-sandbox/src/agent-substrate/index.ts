/**
 * sandbox_exec dispatch entry for Agent Substrate (ADR 0011).
 */

import { Effect, Layer } from "effect";
import type { SandboxBridgeResponse, SandboxCodeToolInput } from "../types.js";
import { agentSubstrateLiveFromEnv, AgentSubstrateService } from "./service.js";
import { InMemoryAgentSubstrateWormSinkLive } from "./worm-bridge.js";

/**
 * Run a sandbox_exec snippet inside Agent Substrate.
 * Promise façade for runSandboxBackend; Effect underneath.
 * Layer is built per call so env (`CLAWQL_SANDBOX_AGENT_SUBSTRATE_*`) is current.
 */
export async function callAgentSubstrateSandbox(
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  const stack = Layer.merge(agentSubstrateLiveFromEnv(), InMemoryAgentSubstrateWormSinkLive);
  const program = Effect.gen(function* () {
    const svc = yield* AgentSubstrateService;
    const cfg = svc.config();
    if (!cfg.enabled) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: "Agent Substrate backend disabled (CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED=0)",
        backend: "agent-substrate" as const,
      } satisfies SandboxBridgeResponse;
    }
    const result = yield* svc.exec(input);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.success,
      sandboxId: result.sessionId,
      backend: "agent-substrate" as const,
    } satisfies SandboxBridgeResponse;
  }).pipe(
    Effect.catchTag("AgentSubstrateError", (e) =>
      Effect.succeed({
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: e.reason,
        backend: "agent-substrate" as const,
      } satisfies SandboxBridgeResponse)
    ),
    Effect.provide(stack)
  );

  return Effect.runPromise(program);
}

/** @deprecated Prefer building Layer via agentSubstrateLiveFromEnv() at call sites — env is dynamic. */
export const AgentSubstrateSandboxStackLive = Layer.merge(
  agentSubstrateLiveFromEnv(),
  InMemoryAgentSubstrateWormSinkLive
);

export {
  AgentSubstrateService,
  AgentSubstrateError,
  agentSubstrateLiveFromEnv,
  createMockAgentSubstrateLayer,
  createLiveAgentSubstrateLayer,
} from "./service.js";
export {
  AgentSubstrateWormSink,
  InMemoryAgentSubstrateWormSinkLive,
  recordAgentSubstrateLifecycle,
  type AgentSubstrateWormRecord,
  type AgentSubstrateWormEntryType,
} from "./worm-bridge.js";
export {
  readAgentSubstrateConfig,
  agentSubstrateConfigured,
  parseAgentSubstrateRuntime,
  type AgentSubstrateConfig,
  type AgentSubstrateRuntime,
  type AgentSubstrateSession,
  type AgentSubstrateExecResult,
  type AgentSubstrateLifecycleEvent,
} from "./types.js";

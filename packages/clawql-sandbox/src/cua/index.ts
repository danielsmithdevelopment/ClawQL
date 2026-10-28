/**
 * Cua Spaces optional isolation backend (ADR 0018).
 * Open reference runner: same IsolationBackendService as Ontologiql.
 */

import { Effect, Layer } from "effect";
import type { SandboxBridgeResponse, SandboxCodeToolInput } from "../types.js";
import { IsolationBackendService } from "../isolation-backend/interface.js";
import { cuaIsolationLayerFromEnv } from "./service.js";
import { readCuaConfigEffect } from "./types.js";
import { defaultPersistence, resolveSandboxId } from "../shared.js";

export function callCuaSandboxEffect(
  input: SandboxCodeToolInput
): Effect.Effect<SandboxBridgeResponse> {
  const stack = cuaIsolationLayerFromEnv();
  return Effect.gen(function* () {
    const cfg = yield* readCuaConfigEffect();
    if (!cfg.enabled) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: "Cua backend disabled (CLAWQL_SANDBOX_CUA_ENABLED=0)",
        backend: "cua" as const,
      } satisfies SandboxBridgeResponse;
    }
    const backend = yield* IsolationBackendService;
    const persistenceMode = input.persistenceMode ?? defaultPersistence();
    const sessionId = resolveSandboxId(persistenceMode, input.sessionId);
    yield* backend.admit({
      sessionId,
      tier: cfg.defaultTier,
      worktreePath: undefined,
    });
    const result = yield* backend.exec({ ...input, sessionId });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.success,
      sandboxId: result.sessionId,
      backend: "cua" as const,
    } satisfies SandboxBridgeResponse;
  }).pipe(
    Effect.catchTag("IsolationBackendError", (e) =>
      Effect.succeed({
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: e.reason,
        backend: "cua" as const,
      } satisfies SandboxBridgeResponse)
    ),
    Effect.provide(stack)
  );
}

export async function callCuaSandbox(input: SandboxCodeToolInput): Promise<SandboxBridgeResponse> {
  return Effect.runPromise(callCuaSandboxEffect(input));
}

export {
  PINNED_CUA_NPM_PACKAGE,
  PINNED_CUA_NPM_VERSION,
  PINNED_CUA_NPM_SPEC,
  cuaLicenseVerdict,
  cuaLicenseVerdictEffect,
  assertCuaLicenseAllowsWorkEffect,
  type CuaLicenseVerdict,
} from "./pinned-version.js";
export {
  readCuaConfig,
  readCuaConfigEffect,
  cuaConfigured,
  cuaConfiguredEffect,
  parseCuaTier,
  parseCuaTierEffect,
  type CuaConfig,
  type CuaBackendMode,
} from "./types.js";
export {
  CuaBackendError,
  CuaConfigService,
  createMockCuaIsolationLayer,
  createLiveCuaIsolationLayer,
  cuaIsolationLiveFromEnv,
  cuaIsolationLayerFromEnv,
  resolveCuaTier,
} from "./service.js";
export {
  CallRecordReplayService,
  RecordReplayError,
  createCallRecordReplayLayer,
  digestOutboundCallEffect,
  assertReplaySpikeDoneEffect,
  type CallDigest,
  type RecordedCall,
  type ReplayMode,
  type ReplayOutcome,
} from "./record-replay.js";
export {
  TrialCheckpointService,
  TrialCheckpointError,
  createTrialCheckpointLayer,
  forkPilotTrialsEffect,
  type TrialArm,
  type TrialCheckpoint,
} from "./trial-checkpoint.js";
export {
  GATEWAY_BYPASS_PROBES,
  runGatewayBypassProbesEffect,
  assertNoGatewayBypassEffect,
  type GatewayBypassReport,
} from "./gateway-bypass.js";

/** Re-export Layer helper for Ontologiql / open reference runner wiring. */
export { IsolationBackendService } from "../isolation-backend/interface.js";
export { runIsolationConformanceEffect } from "../isolation-backend/conformance.js";

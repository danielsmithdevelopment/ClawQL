/**
 * Native Effect.gen staging for sandbox_exec:
 * parse backend env → resolve backend (capability probes) → dispatch IO → shape MCP content.
 */

import { Effect } from "effect";
import { callAgentSubstrateSandboxEffect } from "../agent-substrate/index.js";
import {
  parseExplicitSandboxBackendEnvEffect,
  resolveSandboxBackendChoiceEffect,
  type ExplicitSandboxBackend,
} from "../backend-selection.js";
import { callSandboxBridgeEffect } from "../bridge-client.js";
import { callDockerSandboxEffect } from "../container.js";
import { callKataSandboxEffect } from "../kata-kubernetes.js";
import { callMacosSeatbeltSandboxEffect } from "../macos-seatbelt.js";
import type {
  SandboxBridgeResponse,
  SandboxCodeToolInput,
  SandboxExecBackendKind,
} from "../types.js";
import { SandboxError } from "./sandbox-errors.js";

export type SandboxExecResult = {
  content: { type: "text"; text: string }[];
};

export type SandboxBackendChoice =
  { ok: true; backend: SandboxExecBackendKind } | { ok: false; error: string };

function mcpText(result: SandboxBridgeResponse): SandboxExecResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/** Dispatch to the selected sandbox backend (Effect primary). */
export function runSandboxBackendEffect(
  backend: SandboxExecBackendKind,
  input: SandboxCodeToolInput
): Effect.Effect<SandboxBridgeResponse> {
  if (backend === "agent-substrate") return callAgentSubstrateSandboxEffect(input);
  if (backend === "kata") return callKataSandboxEffect(input);
  if (backend === "macos-seatbelt") return callMacosSeatbeltSandboxEffect(input);
  if (backend === "docker") return callDockerSandboxEffect(input);
  return callSandboxBridgeEffect(input).pipe(
    Effect.map((r) => ({ ...r, backend: "bridge" as const }))
  );
}

/** Promise façade for callers that still await backend dispatch. */
export async function runSandboxBackend(
  backend: SandboxExecBackendKind,
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  return Effect.runPromise(runSandboxBackendEffect(backend, input));
}

/**
 * sandbox_exec pipeline as Effect.gen.
 * Capability probes + backend execute are Effect programs end-to-end.
 */
export function executeSandboxExecEffect(
  input: SandboxCodeToolInput,
  opts?: { explicitBackend?: ExplicitSandboxBackend }
): Effect.Effect<SandboxExecResult, SandboxError> {
  return Effect.gen(function* () {
    const explicit =
      opts?.explicitBackend !== undefined
        ? opts.explicitBackend
        : yield* parseExplicitSandboxBackendEnvEffect();
    const choice = yield* resolveSandboxBackendChoiceEffect(explicit);
    if (!choice.ok) {
      return mcpText({
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: choice.error,
      });
    }
    const result = yield* runSandboxBackendEffect(choice.backend, input);
    return mcpText(result);
  });
}

/**
 * Native Effect.gen staging for sandbox_exec:
 * parse backend env → resolve backend (capability probes) → dispatch IO → shape MCP content.
 * Backend runtimes (Kata / Docker / Seatbelt / bridge) stay behind {@link sandboxFromPromise}.
 */

import { Effect } from "effect";
import {
  parseExplicitSandboxBackendEnv,
  resolveSandboxBackendChoice,
  type ExplicitSandboxBackend,
} from "../backend-selection.js";
import { callSandboxBridge } from "../bridge-client.js";
import { callDockerSandbox } from "../container.js";
import { callKataSandbox } from "../kata-kubernetes.js";
import { callMacosSeatbeltSandbox } from "../macos-seatbelt.js";
import type {
  SandboxBridgeResponse,
  SandboxCodeToolInput,
  SandboxExecBackendKind,
} from "../types.js";
import { SandboxError } from "./sandbox-errors.js";
import { sandboxFromPromise } from "./sandbox-effect-utils.js";

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

/** Dispatch to the selected sandbox backend (IO edge). */
export async function runSandboxBackend(
  backend: SandboxExecBackendKind,
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  if (backend === "kata") return callKataSandbox(input);
  if (backend === "macos-seatbelt") return callMacosSeatbeltSandbox(input);
  if (backend === "docker") return callDockerSandbox(input);
  return { ...(await callSandboxBridge(input)), backend: "bridge" };
}

/**
 * sandbox_exec pipeline as Effect.gen.
 * Capability probes + backend execute use {@link sandboxFromPromise}; shaping is sync.
 */
export function executeSandboxExecEffect(
  input: SandboxCodeToolInput,
  opts?: { explicitBackend?: ExplicitSandboxBackend }
): Effect.Effect<SandboxExecResult, SandboxError> {
  return Effect.gen(function* () {
    const explicit = opts?.explicitBackend ?? parseExplicitSandboxBackendEnv();
    const choice = yield* sandboxFromPromise(() => resolveSandboxBackendChoice(explicit));
    if (!choice.ok) {
      return mcpText({
        stdout: "",
        stderr: "",
        exitCode: -1,
        success: false,
        error: choice.error,
      });
    }
    const result = yield* sandboxFromPromise(() => runSandboxBackend(choice.backend, input));
    return mcpText(result);
  });
}

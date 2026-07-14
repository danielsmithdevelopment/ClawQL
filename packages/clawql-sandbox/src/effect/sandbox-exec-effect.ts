import { Effect } from "effect";
import { handleClawqlCodeToolInput, type SandboxCodeToolInput } from "../bridge-client.js";
import { SandboxError } from "./sandbox-errors.js";
import { sandboxFromPromise } from "./sandbox-effect-utils.js";

export type SandboxExecResult = Awaited<ReturnType<typeof handleClawqlCodeToolInput>>;

/** Effect program for `sandbox_exec` (backend resolve + execute at IO edge). */
export function executeSandboxExecEffect(
  input: SandboxCodeToolInput
): Effect.Effect<SandboxExecResult, SandboxError> {
  return sandboxFromPromise(() => handleClawqlCodeToolInput(input));
}

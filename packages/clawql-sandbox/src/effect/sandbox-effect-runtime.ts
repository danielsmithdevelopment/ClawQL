import { Cause, Effect, Exit, Layer } from "effect";
import type { SandboxCodeToolInput } from "../bridge-client.js";
import { SandboxError } from "./sandbox-errors.js";
import { SandboxExecService, sandboxExecLiveLayer } from "./sandbox-exec-service.js";
import type { SandboxExecResult } from "./sandbox-exec-effect.js";

export type SandboxServices = SandboxExecService;

/** Merged Effect Layer for clawql-sandbox domain services. */
export function sandboxServicesLiveLayer(): Layer.Layer<SandboxServices> {
  return sandboxExecLiveLayer();
}

function throwSandboxFailure(cause: Cause.Cause<unknown>): never {
  const squashed = Cause.squash(cause);
  if (squashed instanceof SandboxError && squashed.cause != null) {
    if (squashed.cause instanceof Error) throw squashed.cause;
    throw new Error(String(squashed.cause));
  }
  throw squashed;
}

/** Run a sandbox Effect program with default services Layer. */
export async function runSandboxEffect<A, E>(
  program: Effect.Effect<A, E, SandboxServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(sandboxServicesLiveLayer()))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throwSandboxFailure(exit.cause);
}

/** `sandbox_exec` via Effect services. */
export function sandboxExecProgram(
  input: SandboxCodeToolInput
): Effect.Effect<SandboxExecResult, unknown, SandboxServices> {
  return Effect.gen(function* () {
    const svc = yield* SandboxExecService;
    return yield* svc.exec(input);
  });
}

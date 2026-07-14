import { Context, Effect, Layer } from "effect";
import type { SandboxCodeToolInput } from "../bridge-client.js";
import { SandboxError } from "./sandbox-errors.js";
import { executeSandboxExecEffect, type SandboxExecResult } from "./sandbox-exec-effect.js";

/** Effect service for `sandbox_exec` tool body. */
export class SandboxExecService extends Context.Tag("clawql/SandboxExecService")<
  SandboxExecService,
  {
    readonly exec: (input: SandboxCodeToolInput) => Effect.Effect<SandboxExecResult, SandboxError>;
  }
>() {}

export function sandboxExecLiveLayer(): Layer.Layer<SandboxExecService> {
  return Layer.succeed(
    SandboxExecService,
    SandboxExecService.of({
      exec: executeSandboxExecEffect,
    })
  );
}

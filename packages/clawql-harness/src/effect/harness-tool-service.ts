import { Context, Effect, Layer } from "effect";
import type { WORMAuditTrailService } from "clawql-audit";
import type { HarnessRegistryState } from "../registry.js";
import { invokeHarnessTool, listHarnessTools } from "../tool-bridge.js";
import type { HarnessPluginError, HarnessTool } from "../types.js";

export class HarnessToolService extends Context.Tag("clawql/HarnessToolService")<
  HarnessToolService,
  {
    readonly listTools: (state: HarnessRegistryState) => Effect.Effect<readonly HarnessTool[]>;
    readonly invokeTool: (
      state: HarnessRegistryState,
      toolName: string,
      args?: Record<string, unknown>
    ) => Effect.Effect<unknown, HarnessPluginError, WORMAuditTrailService>;
  }
>() {}

export const HarnessToolServiceLive = Layer.succeed(
  HarnessToolService,
  HarnessToolService.of({
    listTools: (state) => Effect.sync(() => listHarnessTools(state)),
    invokeTool: (state, toolName, args) => invokeHarnessTool(state, toolName, args),
  })
);

export function runHarnessToolEffect<A, E>(
  program: Effect.Effect<A, E, HarnessToolService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(HarnessToolServiceLive)));
}

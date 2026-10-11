import { Context, Effect, Layer } from "effect";
import type { ExecuteInputDecoded } from "./schema/search-execute-schema.js";

/** MCP `execute` pipeline input (from {@link ExecuteInputSchema}) plus host-only fields. */
export type ExecuteInput = ExecuteInputDecoded & {
  /**
   * Consume this approved parked mandate once (program proposal submit). Hosts set it;
   * it is never decoded from MCP `execute` arguments.
   */
  readonly approvedExecutionId?: string;
};

export type ExecuteOutput = {
  readonly content: { readonly type: "text"; readonly text: string }[];
};

export class ExecuteService extends Context.Service<
  ExecuteService,
  {
    readonly execute: (input: ExecuteInput) => Effect.Effect<ExecuteOutput, Error>;
  }
>()("clawql/ExecuteService") {}

export const executeNotConfigured = ExecuteService.of({
  execute: () =>
    Effect.fail(
      new Error("ExecuteService not configured — provide ExecuteLive in createClawQLApi")
    ),
});

export const ExecuteNotConfiguredLive = Layer.succeed(ExecuteService, executeNotConfigured);

import { Context, Effect, Layer } from "effect";

/** MCP `execute` pipeline (Phase 1 stub — wired to spec execute in clawql-mcp next). */
export type ExecuteInput = {
  readonly operationId: string;
  readonly args?: Record<string, unknown>;
  readonly fields?: string[];
};

export type ExecuteOutput = {
  readonly data: unknown;
};

export class ExecuteService extends Context.Tag("clawql/ExecuteService")<
  ExecuteService,
  {
    readonly execute: (input: ExecuteInput) => Effect.Effect<ExecuteOutput, Error>;
  }
>() {}

export const executeNotConfigured = ExecuteService.of({
  execute: () =>
    Effect.fail(
      new Error("ExecuteService not configured — provide ExecuteLive in createClawQLApi")
    ),
});

export const ExecuteNotConfiguredLive = Layer.succeed(ExecuteService, executeNotConfigured);

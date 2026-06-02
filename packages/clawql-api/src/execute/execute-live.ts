import { Effect, Layer } from "effect";
import { ExecuteService } from "../execute-service.js";
import { executeClawqlOperationWithEnv } from "./execute-core.js";
import type { ExecuteEnvironment } from "./types.js";

/** Build an ExecuteService layer from clawql-mcp IO (strangler until spec-loader moves). */
export function makeExecuteLive(env: ExecuteEnvironment): Layer.Layer<ExecuteService> {
  return Layer.succeed(
    ExecuteService,
    ExecuteService.of({
      execute: (input) =>
        Effect.tryPromise(async () => {
          const content = await executeClawqlOperationWithEnv(env, {
            operationId: input.operationId,
            args: input.args ?? {},
            fields: input.fields,
          });
          return { content };
        }),
    })
  );
}

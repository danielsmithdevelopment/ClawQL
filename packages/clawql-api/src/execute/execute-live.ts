import { Effect, Layer } from "effect";
import { ExecuteService } from "../execute-service.js";
import { loadSpec } from "../spec/spec-loader.js";
import type { LoadSpecFn } from "../search/search-live.js";
import { executeClawqlOperation } from "./execute-core.js";

/** Build an ExecuteService layer; optional `loadSpecFn` for tests and MCP overrides. */
export function makeExecuteLive(loadSpecFn: LoadSpecFn = loadSpec): Layer.Layer<ExecuteService> {
  return Layer.succeed(
    ExecuteService,
    ExecuteService.of({
      execute: (input) =>
        Effect.tryPromise(async () => {
          const content = await executeClawqlOperation(
            {
              operationId: input.operationId,
              args: input.args ?? {},
              fields: input.fields,
            },
            loadSpecFn
          );
          return { content };
        }),
    })
  );
}

export type { LoadSpecFn };

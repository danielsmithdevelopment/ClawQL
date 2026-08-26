import {
  appendProcessWormEffect,
  wormInputFromToolAttempt,
  wormInputFromToolResult,
} from "clawql-audit";
import { Effect, Layer } from "effect";
import { ExecuteService } from "../execute-service.js";
import { loadSpec } from "../spec/spec-loader.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { executeClawqlOperationEffect } from "./execute-core.js";

function executeResultLooksOk(content: { type: "text"; text: string }[]): boolean {
  const text = content[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed) return false;
  } catch {
    /* non-JSON success payloads are treated as ok */
  }
  return true;
}

/** Build an ExecuteService layer; optional `loadSpecFn` for tests and MCP overrides. */
export function makeExecuteLive(loadSpecFn: LoadSpecFn = loadSpec): Layer.Layer<ExecuteService> {
  return Layer.succeed(
    ExecuteService,
    ExecuteService.of({
      execute: (input) =>
        Effect.gen(function* () {
          const args = input.args ?? {};
          yield* Effect.gen(function* () {
            const attempt = yield* wormInputFromToolAttempt({
              operationId: input.operationId,
              argKeys: Object.keys(args),
            });
            yield* appendProcessWormEffect(attempt);
          }).pipe(Effect.catchAll(() => Effect.void));

          const content = yield* executeClawqlOperationEffect(
            {
              operationId: input.operationId,
              args,
              fields: input.fields,
            },
            loadSpecFn
          );

          const ok = executeResultLooksOk(content);
          yield* Effect.gen(function* () {
            const result = yield* wormInputFromToolResult({
              operationId: input.operationId,
              ok,
              detail: ok ? undefined : content[0]?.text?.slice(0, 500),
            });
            yield* appendProcessWormEffect(result);
          }).pipe(Effect.catchAll(() => Effect.void));

          return { content };
        }),
    })
  );
}

export type { LoadSpecFn };

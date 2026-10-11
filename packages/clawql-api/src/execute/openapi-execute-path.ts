/**
 * Choose REST vs in-process OpenAPI→GraphQL for single-spec OpenAPI execute.
 *
 * Warm-path cost: uncached `@omnigraph` schema build is ~5–6ms on a tiny pets
 * spec; REST is ~0.5ms for the same HTTP. Multi-spec already uses REST.
 * Nested GraphQL selection (`nodes { id }`) still needs the GraphQL path for
 * nested projection; plain `fields` keys are equivalent after `projectRestByFields`.
 */

import { Effect } from "effect";
import { defaultFields } from "./field-projection.js";

export type OpenApiExecutePathMode = "auto" | "rest" | "graphql";

/**
 * `CLAWQL_OPENAPI_EXECUTE_PATH`:
 * - `auto` (default) — REST when selection has no nested `{…}`; else GraphQL→REST fallback
 * - `rest` — always REST (same as multi-spec OpenAPI)
 * - `graphql` — legacy GraphQL-first with REST fallback
 */
export function openApiExecutePathModeEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<OpenApiExecutePathMode> {
  return Effect.sync(() => {
    const raw = env.CLAWQL_OPENAPI_EXECUTE_PATH?.trim().toLowerCase();
    if (raw === "rest" || raw === "graphql" || raw === "auto") return raw;
    return "auto";
  });
}

/** True when the GraphQL selection string includes a nested selection set. */
export function selectionNeedsInProcessGraphQLEffect(
  operationId: string,
  outputFields: readonly string[] | undefined
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const selection = outputFields?.length ? outputFields.join("\n") : defaultFields(operationId);
    return selection.includes("{");
  });
}

/**
 * Whether single-spec OpenAPI execute should take the REST path (skip Omnigraph).
 */
export function preferRestOpenApiExecuteEffect(
  operationId: string,
  outputFields: readonly string[] | undefined,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const mode = yield* openApiExecutePathModeEffect(env);
    if (mode === "rest") return true;
    if (mode === "graphql") return false;
    const needsGql = yield* selectionNeedsInProcessGraphQLEffect(operationId, outputFields);
    return !needsGql;
  });
}

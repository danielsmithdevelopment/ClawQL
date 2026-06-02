/**
 * Effect Layers that adapt existing clawql-mcp search/execute logic for clawql-api.
 * MCP handlers call SearchService / ExecuteService via getClawqlApi().
 */

import {
  createClawQLApi,
  makeExecuteLive,
  SearchService,
  type ClawQLApiHandle,
  type ExecuteClawqlOperationParams,
} from "clawql-api";
import { Effect, Layer } from "effect";
import { mcpExecuteEnvironment } from "./mcp-execute-environment.js";
import { loadSpec } from "./spec-loader.js";
import { formatSearchResults, searchOperations } from "./spec-search.js";

export const SearchLive = Layer.succeed(
  SearchService,
  SearchService.of({
    search: ({ query, limit }) =>
      Effect.tryPromise(async () => {
        const { operations } = await loadSpec();
        const results = searchOperations(operations, query, limit ?? 5);
        return { formattedText: formatSearchResults(results) };
      }),
  })
);

export const ExecuteLive = makeExecuteLive(mcpExecuteEnvironment);

let apiHandle: ClawQLApiHandle | undefined;

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    apiHandle = createClawQLApi({
      searchLayer: SearchLive,
      executeLayer: ExecuteLive,
    });
  }
  return apiHandle;
}

/** Test helper — next getClawqlApi() builds a fresh runtime. */
export function resetClawqlApiForTests(): void {
  apiHandle = undefined;
}

export type { ExecuteClawqlOperationParams };

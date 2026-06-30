import {
  composeDefaultPlugins,
  createClawQLApi,
  getClawqlOptionalToolFlags,
  loadSpec,
  makeExecuteLive,
  makeSearchLive,
  McpProxyPipeline,
  SearchService,
  type ClawQLApiHandle,
  type ExecuteClawqlOperationParams,
  type LoadedSpec,
  type LoadSpecFn,
} from "clawql-api";
import { createDocumentsPlugin } from "clawql-documents/plugin";
import type { Plugin } from "clawql-core";
import { Effect, Layer } from "effect";

let loadSpecOverride: LoadSpecFn | undefined;

/** Test hook — inject mock loadSpec for search/execute handlers. */
export function setLoadSpecForTests(fn: LoadSpecFn | undefined): void {
  loadSpecOverride = fn;
  resetClawqlApiForTests();
}

function resolveLoadSpec(): LoadSpecFn {
  return loadSpecOverride ?? loadSpec;
}

function buildSearchLive(): Layer.Layer<SearchService> {
  return makeSearchLive(resolveLoadSpec());
}

function buildExecuteLive() {
  return makeExecuteLive(resolveLoadSpec());
}

function buildMcpPlugins(): readonly Plugin[] {
  const flags = getClawqlOptionalToolFlags();
  return [
    ...composeDefaultPlugins({ enableMemory: flags.enableMemory }),
    ...(flags.enableDocuments
      ? [
          createDocumentsPlugin({
            enableOnyx: flags.enableOnyxKnowledge,
          }),
        ]
      : []),
  ];
}

let apiHandle: ClawQLApiHandle | undefined;

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    apiHandle = createClawQLApi({
      searchLayer: buildSearchLive(),
      executeLayer: buildExecuteLive(),
      plugins: buildMcpPlugins(),
    });
  }
  return apiHandle;
}

/** Test helper — next getClawqlApi() builds a fresh runtime. */
export function resetClawqlApiForTests(): void {
  apiHandle = undefined;
}

/** Run mcp-proxy `beforeCallTool` hooks (Panguard in-process policy). */
export async function runMcpProxyBeforeCallTool(toolName: string, args: unknown): Promise<void> {
  await getClawqlApi().run(
    Effect.gen(function* () {
      const pipeline = yield* McpProxyPipeline;
      yield* pipeline.runBeforeCallTool({ toolName, args });
    })
  );
}

export type { ExecuteClawqlOperationParams, LoadedSpec, LoadSpecFn };

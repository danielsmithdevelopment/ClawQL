import {
  createClawQLApi,
  defaultPlugins,
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
import { defaultPaymentsProxyPlugins } from "clawql-payments/plugin";
import { Effect, Layer } from "effect";
import { composeHorizontalPluginLayers } from "./compose-horizontal-plugin-layers.js";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";

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

let apiHandle: ClawQLApiHandle | undefined;

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    apiHandle = createClawQLApi({
      searchLayer: buildSearchLive(),
      executeLayer: buildExecuteLive(),
      plugins: [...defaultPlugins(), ...defaultPaymentsProxyPlugins()],
      pluginLayers: composeHorizontalPluginLayers(resolvePluginCompositionFlags()),
    });
  }
  return apiHandle;
}

/** Test helper — next getClawqlApi() builds a fresh runtime. */
export function resetClawqlApiForTests(): void {
  if (!apiHandle) return;
  Effect.runSync(apiHandle.registry.teardownAll());
  apiHandle = undefined;
}

/** Run mcp-proxy `beforeCallTool` hooks (Panguard policy, x402 payment gates, …). */
export async function runMcpProxyBeforeCallTool(toolName: string, args: unknown): Promise<void> {
  await getClawqlApi().run(
    Effect.gen(function* () {
      const pipeline = yield* McpProxyPipeline;
      yield* pipeline.runBeforeCallTool({ toolName, args });
    })
  );
}

export type { ExecuteClawqlOperationParams, LoadedSpec, LoadSpecFn };

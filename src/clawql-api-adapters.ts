import {
  createClawQLApi,
  defaultPlugins,
  getClawqlOptionalToolFlags,
  loadSpec,
  makeExecuteLive,
  makeMemoryLayer,
  makeSearchLive,
  McpProxyPipeline,
  SearchService,
  type ClawQLApiHandle,
  type ClawQLApiRuntimeError,
  type ClawQLApiRuntimeServices,
  type ExecuteClawqlOperationParams,
  type LoadedSpec,
  type LoadSpecFn,
} from "clawql-api";
import { makeDocumentsLayer } from "clawql-documents/plugin";
import { makeAutomationLayer } from "clawql-automation/plugin";
import { natsConfiguredForConsumer } from "clawql-automation/nats/env";
import { createSandboxPlugin } from "clawql-sandbox/plugin";
import { createOuroborosPlugin } from "clawql-ouroboros/plugin";
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

function buildSyncOptionalPlugins(): readonly Plugin[] {
  const flags = getClawqlOptionalToolFlags();
  const plugins: Plugin[] = [];
  if (flags.enableSandbox) {
    plugins.push(createSandboxPlugin());
  }
  if (flags.enableOuroboros) {
    plugins.push(createOuroborosPlugin({ enableLangfuseEval: flags.enableLangfuseEval }));
  }
  return plugins;
}

function buildEnabledPluginLayers(): readonly Layer.Layer<
  never,
  ClawQLApiRuntimeError,
  ClawQLApiRuntimeServices
>[] {
  const flags = getClawqlOptionalToolFlags();
  const layers: Layer.Layer<never, ClawQLApiRuntimeError, ClawQLApiRuntimeServices>[] = [];
  if (flags.enableMemory) {
    layers.push(makeMemoryLayer());
  }
  if (flags.enableDocuments) {
    layers.push(
      makeDocumentsLayer({
        enableOnyx: flags.enableOnyxKnowledge,
        enableIdpPipeline: flags.enableIdpPipeline,
        enableIdpClassifier: flags.enableIdpClassifier,
        enableLangextract: flags.enableLangextract,
      })
    );
  }
  if (
    flags.enableSchedule ||
    flags.enableNotify ||
    flags.enableWorkflow ||
    flags.enableArgoCd ||
    flags.enableHitlLabelStudio ||
    natsConfiguredForConsumer()
  ) {
    layers.push(
      makeAutomationLayer({
        enableSchedule: flags.enableSchedule,
        enableNotify: flags.enableNotify,
        enableWorkflow: flags.enableWorkflow,
        enableArgoCd: flags.enableArgoCd,
        enableHitlLabelStudio: flags.enableHitlLabelStudio,
        enableNatsWorker: natsConfiguredForConsumer(),
      })
    );
  }
  return layers;
}

let apiHandle: ClawQLApiHandle | undefined;

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    apiHandle = createClawQLApi({
      searchLayer: buildSearchLive(),
      executeLayer: buildExecuteLive(),
      plugins: [...defaultPlugins(), ...buildSyncOptionalPlugins()],
      pluginLayers: buildEnabledPluginLayers(),
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

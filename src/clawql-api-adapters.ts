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
import { createAutomationPlugin } from "clawql-automation/plugin";
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

function buildMcpPlugins(): readonly Plugin[] {
  const flags = getClawqlOptionalToolFlags();
  const plugins: Plugin[] = [...composeDefaultPlugins({ enableMemory: flags.enableMemory })];
  if (flags.enableDocuments) {
    plugins.push(
      createDocumentsPlugin({
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
    natsConfiguredForConsumer()
  ) {
    plugins.push(
      createAutomationPlugin({
        enableSchedule: flags.enableSchedule,
        enableNotify: flags.enableNotify,
        enableWorkflow: flags.enableWorkflow,
        enableArgoCd: flags.enableArgoCd,
        enableNatsWorker: natsConfiguredForConsumer(),
      })
    );
  }
  if (flags.enableSandbox) {
    plugins.push(createSandboxPlugin());
  }
  if (flags.enableOuroboros) {
    plugins.push(createOuroborosPlugin({ enableLangfuseEval: flags.enableLangfuseEval }));
  }
  return plugins;
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

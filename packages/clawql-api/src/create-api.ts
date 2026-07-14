import {
  AuditLive,
  type ClawQLError,
  type McpToolAlreadyRegisteredError,
  type Plugin,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClawQLApi, clawqlApiLayer } from "./clawql-api-service.js";
import { ExecuteNotConfiguredLive, ExecuteService } from "./execute-service.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { composeDefaultPlugins } from "./plugins/compose-default-plugins.js";
import { PluginRegistry } from "./plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "./proxy/mcp-proxy-pipeline.js";
import { SearchNotConfiguredLive, SearchService } from "./search-service.js";

export type ClawQLApiRuntimeServices =
  ClawQLApi | SearchService | ExecuteService | McpProxyPipeline;

export type ClawQLApiRuntimeError =
  PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError | Error;

export type CreateClawQLApiOptions = {
  /** Replaces default SearchNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly searchLayer?: Layer.Layer<SearchService, never, never>;
  /** Replaces default ExecuteNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly executeLayer?: Layer.Layer<ExecuteService, never, never>;
  /** Plugins registered synchronously at composition root (defaults include Panguard + Memory when enabled). */
  readonly plugins?: readonly Plugin[];
  /**
   * Effect Layers that register plugins at runtime via `ClawQLApi.registerPlugin`.
   * Merged after the base layer; each layer may require `ClawQLApi`, `ExecuteService`, etc.
   */
  readonly pluginLayers?: readonly Layer.Layer<
    never,
    ClawQLApiRuntimeError,
    ClawQLApiRuntimeServices
  >[];
  /**
   * Extra Layers merged into the ManagedRuntime (e.g. `@effect/opentelemetry` Tracer).
   * Must be fully satisfied (`R = never`).
   */
  readonly runtimeLayers?: readonly Layer.Layer<never, never, never>[];
  /**
   * Optional transform applied to every `run()` program (e.g. attach active OTEL parent span).
   */
  readonly prepareEffect?: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Effect.Effect<A, E, ClawQLApiRuntimeServices>;
};

export type ClawQLApiHandle = {
  readonly registry: PluginRegistry;
  readonly mcpTools: McpToolRegistry;
  readonly layer: Layer.Layer<ClawQLApiRuntimeServices, ClawQLApiRuntimeError, never>;
  readonly runtime: ManagedRuntime.ManagedRuntime<ClawQLApiRuntimeServices, ClawQLApiRuntimeError>;
  readonly listMcpTools: () => readonly import("./mcp-tool-registry.js").McpToolRegistration[];
  readonly run: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Promise<A>;
  /** Tear down plugins then dispose the ManagedRuntime (call on process shutdown). */
  readonly dispose: () => Promise<void>;
};

/**
 * Composition root for ClawQL (enablement §5, plan Phase 1).
 * MCP transport calls `run(searchEffect)` / `run(executeEffect)` via adapters.
 */
export function createClawQLApi(options: CreateClawQLApiOptions = {}): ClawQLApiHandle {
  const mcpTools = new McpToolRegistry();
  const registrationApi = mcpTools.registrationApi();
  const registry = new PluginRegistry();
  for (const plugin of options.plugins ?? composeDefaultPlugins()) {
    Effect.runSync(registry.register(plugin, registrationApi));
  }
  const listMcpTools = () => mcpTools.list();
  const baseLayer: Layer.Layer<ClawQLApiRuntimeServices, never, never> = Layer.mergeAll(
    AuditLive,
    Layer.succeed(ClawQLApi, clawqlApiLayer(registry, registrationApi, listMcpTools)),
    mcpProxyPipelineLayer(registry),
    options.searchLayer ?? SearchNotConfiguredLive,
    options.executeLayer ?? ExecuteNotConfiguredLive
  );
  for (const pluginLayer of options.pluginLayers ?? []) {
    Effect.runSync(Effect.scoped(Layer.build(Layer.provideMerge(pluginLayer, baseLayer))));
  }
  const extras = options.runtimeLayers ?? [];
  const layer: Layer.Layer<ClawQLApiRuntimeServices, ClawQLApiRuntimeError, never> =
    extras.length === 0
      ? baseLayer
      : (Layer.mergeAll(baseLayer, ...extras) as Layer.Layer<
          ClawQLApiRuntimeServices,
          ClawQLApiRuntimeError,
          never
        >);
  const runtime = ManagedRuntime.make(layer);
  const prepare = options.prepareEffect;

  return {
    registry,
    mcpTools,
    layer,
    runtime,
    listMcpTools,
    run: (program) => runtime.runPromise(prepare ? prepare(program) : program),
    dispose: async () => {
      await Effect.runPromise(registry.teardownAll());
      await runtime.dispose();
    },
  };
}

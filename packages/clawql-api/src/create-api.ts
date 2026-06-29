import {
  AuditLive,
  type ClawQLError,
  type Plugin,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClawQLApi, clawqlApiLayer } from "./clawql-api-service.js";
import { ExecuteNotConfiguredLive, ExecuteService } from "./execute-service.js";
import { defaultPlugins } from "./plugins/panguard-proxy-plugin.js";
import { PluginRegistry } from "./plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "./proxy/mcp-proxy-pipeline.js";
import { SearchNotConfiguredLive, SearchService } from "./search-service.js";

export type ClawQLApiRuntimeServices =
  ClawQLApi | SearchService | ExecuteService | McpProxyPipeline;

export type ClawQLApiRuntimeError = PluginAlreadyRegisteredError | ClawQLError | Error;

export type CreateClawQLApiOptions = {
  /** Replaces default SearchNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly searchLayer?: Layer.Layer<SearchService, never, never>;
  /** Replaces default ExecuteNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly executeLayer?: Layer.Layer<ExecuteService, never, never>;
  /** Plugins registered at composition root (defaults include Panguard proxy). */
  readonly plugins?: readonly Plugin[];
};

export type ClawQLApiHandle = {
  readonly registry: PluginRegistry;
  readonly layer: Layer.Layer<ClawQLApiRuntimeServices, never, never>;
  readonly runtime: ManagedRuntime.ManagedRuntime<ClawQLApiRuntimeServices, never>;
  readonly run: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Promise<A>;
};

/**
 * Composition root for ClawQL (enablement §5, plan Phase 1).
 * MCP transport calls `run(searchEffect)` / `run(executeEffect)` via adapters.
 */
export function createClawQLApi(options: CreateClawQLApiOptions = {}): ClawQLApiHandle {
  const registry = new PluginRegistry();
  for (const plugin of options.plugins ?? defaultPlugins()) {
    Effect.runSync(registry.register(plugin));
  }
  const baseLayer: Layer.Layer<ClawQLApiRuntimeServices, never, never> = Layer.mergeAll(
    AuditLive,
    Layer.succeed(ClawQLApi, clawqlApiLayer(registry)),
    mcpProxyPipelineLayer(registry),
    options.searchLayer ?? SearchNotConfiguredLive,
    options.executeLayer ?? ExecuteNotConfiguredLive
  );
  const layer = baseLayer;
  const runtime = ManagedRuntime.make(layer);

  return {
    registry,
    layer,
    runtime,
    run: (program) => runtime.runPromise(program),
  };
}

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
  /** Plugins registered at composition root (defaults include Panguard + Memory when enabled). */
  readonly plugins?: readonly Plugin[];
};

export type ClawQLApiHandle = {
  readonly registry: PluginRegistry;
  readonly mcpTools: McpToolRegistry;
  readonly layer: Layer.Layer<ClawQLApiRuntimeServices, never, never>;
  readonly runtime: ManagedRuntime.ManagedRuntime<ClawQLApiRuntimeServices, never>;
  readonly listMcpTools: () => readonly import("./mcp-tool-registry.js").McpToolRegistration[];
  readonly run: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Promise<A>;
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
  const layer = baseLayer;
  const runtime = ManagedRuntime.make(layer);

  return {
    registry,
    mcpTools,
    layer,
    runtime,
    listMcpTools,
    run: (program) => runtime.runPromise(program),
  };
}

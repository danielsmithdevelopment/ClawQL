import {
  AuditLive,
  createInMemoryPluginHostServices,
  defineProviderPlugin,
  type ClawQLError,
  type McpToolAlreadyRegisteredError,
  type PluginInstallError,
  type AnyPlugin,
  PluginAlreadyRegisteredError,
  type SkillRegistry,
} from "clawql-core";
import type { Context } from "effect";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClawQLApi, clawqlApiLayer } from "./clawql-api-service.js";
import { ExecuteNotConfiguredLive, ExecuteService } from "./execute-service.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { composeDefaultPlugins } from "./plugins/compose-default-plugins.js";
import { warnIfNoEnforcementActive } from "./plugins/enforcement-boot-warning.js";
import { PluginRegistry } from "./plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "./proxy/mcp-proxy-pipeline.js";
import { SearchService } from "./search-service.js";
import { makeSearchLive } from "./search/search-live.js";
import { bindProcessSkillRegistry } from "./skills/process-skills.js";
import { loadSpec } from "./spec/spec-loader.js";

export type ClawQLApiRuntimeServices =
  ClawQLApi | SearchService | ExecuteService | McpProxyPipeline;

export type ClawQLApiRuntimeError =
  | PluginAlreadyRegisteredError
  | PluginInstallError
  | ClawQLError
  | McpToolAlreadyRegisteredError
  | Error;

export type CreateClawQLApiOptions = {
  /** Replaces default search (operations + skill index). */
  readonly searchLayer?: Layer.Layer<SearchService, never, never>;
  /** Replaces default ExecuteNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly executeLayer?: Layer.Layer<ExecuteService, never, never>;
  /** Plugins registered synchronously at composition root (8.0+: empty unless opted in). */
  readonly plugins?: readonly AnyPlugin[];
  readonly pluginLayers?: readonly Layer.Layer<
    never,
    ClawQLApiRuntimeError,
    ClawQLApiRuntimeServices
  >[];
  readonly runtimeLayers?: readonly Layer.Layer<never, never, never>[];
  readonly prepareEffect?: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Effect.Effect<A, E, ClawQLApiRuntimeServices>;
  /**
   * Vault seed Layer (e.g. MemoryVaultSeedLive from clawql-memory).
   * Default: NoopVaultSeedLive inside createInMemoryPluginHostServices.
   */
  readonly vaultSeedLayer?: Layer.Layer<import("clawql-core").VaultSeedPort, never, never>;
  /** Override loadSpec used by the default unified search layer. */
  readonly loadSpecFn?: typeof loadSpec;
};

export type ClawQLApiHandle = {
  readonly registry: PluginRegistry;
  /** Shared with plugin install, `skills_list`/`skills_get`, and `search` ranking. */
  readonly skillRegistry: Context.Tag.Service<typeof SkillRegistry>;
  readonly hookRegistry: PluginRegistry["hookRegistry"];
  /** Shared WORM sink for hooks (session / model / tool). */
  readonly worm: PluginRegistry["worm"];
  readonly mcpTools: McpToolRegistry;
  readonly layer: Layer.Layer<ClawQLApiRuntimeServices, ClawQLApiRuntimeError, never>;
  readonly runtime: ManagedRuntime.ManagedRuntime<ClawQLApiRuntimeServices, ClawQLApiRuntimeError>;
  readonly listMcpTools: () => readonly import("./mcp-tool-registry.js").McpToolRegistration[];
  readonly run: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Promise<A>;
  readonly dispose: () => Promise<void>;
};

/**
 * Composition root for ClawQL.
 * Binds one SkillRegistry for install + Skills-over-MCP + unified search.
 */
export function createClawQLApi(options: CreateClawQLApiOptions = {}): ClawQLApiHandle {
  const mcpTools = new McpToolRegistry();
  const registrationApi = mcpTools.registrationApi();
  const host = createInMemoryPluginHostServices({
    vaultSeedLayer: options.vaultSeedLayer,
  });
  bindProcessSkillRegistry(host.skillRegistry);

  const registry = new PluginRegistry({
    installLayer: host.layer,
    hookRegistry: host.hookRegistry,
    worm: host.worm,
  });
  for (const plugin of options.plugins ?? composeDefaultPlugins()) {
    Effect.runSync(registry.register(plugin, registrationApi));
  }
  const listMcpTools = () => mcpTools.list();
  const defaultSearch = makeSearchLive(options.loadSpecFn ?? loadSpec, {
    skillRegistry: host.skillRegistry,
  });
  const baseLayer: Layer.Layer<ClawQLApiRuntimeServices, never, never> = Layer.mergeAll(
    AuditLive,
    Layer.succeed(ClawQLApi, clawqlApiLayer(registry, registrationApi, listMcpTools)),
    mcpProxyPipelineLayer(registry),
    options.searchLayer ?? defaultSearch,
    options.executeLayer ?? ExecuteNotConfiguredLive
  );
  let composition: Layer.Layer<ClawQLApiRuntimeServices, ClawQLApiRuntimeError, never> = baseLayer;
  for (const pluginLayer of options.pluginLayers ?? []) {
    composition = Layer.provideMerge(pluginLayer, composition) as Layer.Layer<
      ClawQLApiRuntimeServices,
      ClawQLApiRuntimeError,
      never
    >;
  }
  const extras = options.runtimeLayers ?? [];
  const layer: Layer.Layer<ClawQLApiRuntimeServices, ClawQLApiRuntimeError, never> =
    extras.length === 0
      ? composition
      : (Layer.mergeAll(composition, ...extras) as Layer.Layer<
          ClawQLApiRuntimeServices,
          ClawQLApiRuntimeError,
          never
        >);
  const runtime = ManagedRuntime.make(layer);
  runtime.runSync(Effect.void);
  const prepare = options.prepareEffect;

  warnIfNoEnforcementActive(registry.list());

  return {
    registry,
    skillRegistry: host.skillRegistry,
    hookRegistry: host.hookRegistry,
    worm: host.worm,
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

/** Minimal ProviderPlugin for tests / demos (no tools, no hooks). */
export function emptyProviderPlugin(id: string, version = "0.0.1") {
  return defineProviderPlugin({
    id,
    version,
    description: `test plugin ${id}`,
  });
}

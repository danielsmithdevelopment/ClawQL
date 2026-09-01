/**
 * Host plugin registration — ProviderPlugin / StandaloneSkillPlugin only (8.0 hard break).
 */

import { Context, Effect, Layer } from "effect";
import {
  PluginAlreadyRegisteredError,
  type ClawQLPluginRegistrationApi,
  type ClawQLError,
  type AnyPlugin,
  type PluginInstallServices,
  type PluginInstallError,
  type PluginContext,
  createInMemoryPluginHostServices,
  HookRegistry,
  WormAuditSink,
} from "clawql-core";

export type PluginRegistryOptions = {
  /** Install-time services Layer (HookRegistry + SkillRegistry + VaultSeed + Worm). */
  readonly installLayer: Layer.Layer<PluginInstallServices, never, never>;
  /** Same HookRegistry instance used by McpProxyPipeline.fireHook. */
  readonly hookRegistry: Context.Tag.Service<typeof HookRegistry>;
  readonly worm: Context.Tag.Service<typeof WormAuditSink>;
};

export class PluginRegistry {
  private readonly plugins = new Map<string, AnyPlugin>();
  readonly installLayer: Layer.Layer<PluginInstallServices, never, never>;
  readonly hookRegistry: Context.Tag.Service<typeof HookRegistry>;
  readonly worm: Context.Tag.Service<typeof WormAuditSink>;

  constructor(options?: PluginRegistryOptions) {
    if (options) {
      this.installLayer = options.installLayer;
      this.hookRegistry = options.hookRegistry;
      this.worm = options.worm;
      return;
    }
    const host = createInMemoryPluginHostServices();
    this.installLayer = host.layer;
    this.hookRegistry = host.hookRegistry;
    this.worm = host.worm;
  }

  register(
    plugin: AnyPlugin,
    registrationApi: ClawQLPluginRegistrationApi
  ): Effect.Effect<void, PluginAlreadyRegisteredError | PluginInstallError> {
    const plugins = this.plugins;
    const installLayer = this.installLayer;
    const ctx: PluginContext = { registrationApi, pluginId: plugin.id };
    return Effect.gen(function* () {
      if (plugins.has(plugin.id)) {
        return yield* Effect.fail(new PluginAlreadyRegisteredError({ pluginId: plugin.id }));
      }
      plugins.set(plugin.id, plugin);
      yield* plugin.install(ctx).pipe(Effect.provide(installLayer));
    });
  }

  list(): readonly AnyPlugin[] {
    return [...this.plugins.values()];
  }

  get(id: string): AnyPlugin | undefined {
    return this.plugins.get(id);
  }

  teardownAll(): Effect.Effect<void, ClawQLError> {
    const plugins = this.plugins;
    const installLayer = this.installLayer;
    const registrationApi: ClawQLPluginRegistrationApi = {
      registerMcpTool: () => Effect.void,
    };
    return Effect.gen(function* () {
      for (const plugin of [...plugins.values()].reverse()) {
        const ctx: PluginContext = { registrationApi, pluginId: plugin.id };
        yield* plugin.uninstall(ctx).pipe(
          Effect.provide(installLayer),
          Effect.catchAll(() => Effect.void)
        );
      }
      plugins.clear();
    });
  }
}

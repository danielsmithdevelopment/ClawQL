/**
 * ProviderPlugin / StandaloneSkillPlugin install & uninstall (Effect).
 */

import { Effect, Layer } from "effect";
import { ClawQLError, type McpToolAlreadyRegisteredError } from "../errors/clawql-error.js";
import type { ClawQLPluginRegistrationApi } from "./registration-api.js";
import { validateLifecycleHook } from "./hook-registry.js";
import { assertSkillDefinitions } from "./skill-registry.js";
import {
  HookRegistry,
  SkillRegistry,
  VaultSeedPort,
  WormAuditSink,
  type AnyPlugin,
  type LifecycleHook,
  type PluginContext,
  type PluginInstallError,
  type PluginInstallServices,
  type ProviderPlugin,
  type SkillDefinition,
  type StandaloneSkillPlugin,
  type VaultSeedEntry,
  isStandaloneSkillPlugin,
} from "./provider-types.js";

function providerHooksAndTools(plugin: AnyPlugin): {
  hooks: ProviderPlugin["hooks"];
  tools: ProviderPlugin["tools"];
} {
  if (isStandaloneSkillPlugin(plugin)) return { hooks: undefined, tools: undefined };
  const p = plugin as ProviderPlugin;
  return { hooks: p.hooks, tools: p.tools };
}

export function defaultInstallEffect(
  plugin: AnyPlugin,
  ctx: PluginContext
): Effect.Effect<void, PluginInstallError, PluginInstallServices> {
  return Effect.gen(function* () {
    const skills = yield* SkillRegistry;
    const hooksReg = yield* HookRegistry;
    const vault = yield* VaultSeedPort;
    const worm = yield* WormAuditSink;

    const skillDefs = plugin.skills ?? [];
    if (skillDefs.length) {
      yield* assertSkillDefinitions(skillDefs);
      yield* skills.register(plugin.id, skillDefs);
    }

    const { hooks, tools } = providerHooksAndTools(plugin);
    if (hooks?.length) {
      for (const h of hooks) {
        yield* validateLifecycleHook(h);
      }
      yield* hooksReg.register(plugin.id, hooks);
    }

    if (tools?.length) {
      for (const tool of tools) {
        yield* ctx.registrationApi.registerMcpTool(tool);
      }
    }

    const seeds = plugin.vaultSeed ?? [];
    if (seeds.length) {
      yield* vault.ingestTagged(plugin.id, seeds);
    }

    yield* worm.append({
      type: "PLUGIN_INSTALL",
      pluginId: plugin.id,
      version: plugin.version,
      timestamp: new Date().toISOString(),
    });
  });
}

export function defaultUninstallEffect(
  plugin: AnyPlugin,
  _ctx: PluginContext
): Effect.Effect<void, PluginInstallError, PluginInstallServices> {
  return Effect.gen(function* () {
    const skills = yield* SkillRegistry;
    const hooksReg = yield* HookRegistry;
    const vault = yield* VaultSeedPort;
    const worm = yield* WormAuditSink;

    yield* skills.unregisterPlugin(plugin.id);
    yield* hooksReg.unregisterPlugin(plugin.id);
    yield* vault.deleteByPluginTag(plugin.id);

    yield* worm.append({
      type: "PLUGIN_UNINSTALL",
      pluginId: plugin.id,
      version: plugin.version,
      timestamp: new Date().toISOString(),
    });
  });
}

export function installPlugin(
  plugin: AnyPlugin,
  ctx: PluginContext
): Effect.Effect<void, PluginInstallError, PluginInstallServices> {
  return plugin.install(ctx);
}

export function uninstallPlugin(
  plugin: AnyPlugin,
  ctx: PluginContext
): Effect.Effect<void, PluginInstallError, PluginInstallServices> {
  return plugin.uninstall(ctx);
}

/** Build a ProviderPlugin that uses default install/uninstall unless overridden. */
export function defineProviderPlugin(
  def: Omit<ProviderPlugin, "install" | "uninstall"> &
    Partial<Pick<ProviderPlugin, "install" | "uninstall">>
): ProviderPlugin {
  const plugin: ProviderPlugin = {
    id: def.id,
    version: def.version,
    description: def.description,
    tools: def.tools,
    skills: def.skills,
    vaultSeed: def.vaultSeed,
    hooks: def.hooks,
    install: (ctx) => (def.install ? def.install(ctx) : defaultInstallEffect(plugin, ctx)),
    uninstall: (ctx) => (def.uninstall ? def.uninstall(ctx) : defaultUninstallEffect(plugin, ctx)),
  };
  return plugin;
}

export function defineStandaloneSkillPlugin(
  def: Omit<StandaloneSkillPlugin, "install" | "uninstall"> &
    Partial<Pick<StandaloneSkillPlugin, "install" | "uninstall">>
): StandaloneSkillPlugin {
  const plugin: StandaloneSkillPlugin = {
    id: def.id,
    version: def.version,
    description: def.description,
    skills: def.skills,
    vaultSeed: def.vaultSeed,
    install: (ctx) => (def.install ? def.install(ctx) : defaultInstallEffect(plugin, ctx)),
    uninstall: (ctx) => (def.uninstall ? def.uninstall(ctx) : defaultUninstallEffect(plugin, ctx)),
  };
  return plugin;
}

/**
 * ProviderPlugin that registers MCP tools during `install` via Effect
 * (env-gated / dynamic tool sets). Prefer static `tools` on {@link defineProviderPlugin}
 * when the set is fixed at definition time.
 */
export function defineRegisteringProviderPlugin(def: {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly register: (
    api: ClawQLPluginRegistrationApi
  ) => Effect.Effect<void, ClawQLError | McpToolAlreadyRegisteredError>;
  readonly skills?: readonly SkillDefinition[];
  readonly hooks?: readonly LifecycleHook[];
  readonly vaultSeed?: readonly VaultSeedEntry[];
  readonly onTeardown?: () => Effect.Effect<void, ClawQLError>;
}): ProviderPlugin {
  const plugin: ProviderPlugin = {
    id: def.id,
    version: def.version,
    description: def.description,
    skills: def.skills,
    hooks: def.hooks,
    vaultSeed: def.vaultSeed,
    install: (ctx) =>
      Effect.gen(function* () {
        yield* def.register(ctx.registrationApi);
        yield* defaultInstallEffect(plugin, ctx);
      }),
    uninstall: (ctx) =>
      Effect.gen(function* () {
        if (def.onTeardown) {
          yield* def.onTeardown();
        }
        yield* defaultUninstallEffect(plugin, ctx);
      }),
  };
  return plugin;
}

export const NoopVaultSeedLive: Layer.Layer<VaultSeedPort> = Layer.succeed(VaultSeedPort, {
  ingestTagged: (_pluginId: string, _entries: readonly VaultSeedEntry[]) => Effect.void,
  deleteByPluginTag: (_pluginId: string) => Effect.void,
});

/** In-memory vault seed for reversibility tests. */
export const InMemoryVaultSeedLive: Layer.Layer<VaultSeedPort> = Layer.sync(VaultSeedPort, () => {
  const byPlugin = new Map<string, VaultSeedEntry[]>();
  return {
    ingestTagged: (pluginId, entries) =>
      Effect.sync(() => {
        byPlugin.set(pluginId, [...entries]);
      }),
    deleteByPluginTag: (pluginId) =>
      Effect.sync(() => {
        byPlugin.delete(pluginId);
      }),
  };
});

export function makeRecordingRegistrationApi(): {
  readonly api: import("./registration-api.js").ClawQLPluginRegistrationApi;
  readonly tools: string[];
} {
  const tools: string[] = [];
  return {
    tools,
    api: {
      registerMcpTool: (tool) =>
        Effect.sync(() => {
          tools.push(tool.name);
        }),
    },
  };
}

// silence unused in some builds
void ClawQLError;

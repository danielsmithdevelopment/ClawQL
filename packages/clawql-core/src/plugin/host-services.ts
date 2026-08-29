/**
 * Shared in-memory install services for hosts (clawql-api PluginRegistry).
 * One HookRegistry instance must be shared by install and McpProxyPipeline.fireHook.
 */

import { Context, Effect, Layer } from "effect";
import { InMemoryHookRegistryLive } from "./hook-registry.js";
import { InMemorySkillRegistryLive } from "./skill-registry.js";
import { NoopVaultSeedLive } from "./plugin-installer.js";
import {
  HookRegistry,
  SkillRegistry,
  WormAuditSink,
  type PluginInstallServices,
} from "./provider-types.js";

export type PluginHostServices = {
  readonly layer: Layer.Layer<PluginInstallServices, never, never>;
  readonly hookRegistry: Context.Tag.Service<typeof HookRegistry>;
  readonly skillRegistry: Context.Tag.Service<typeof SkillRegistry>;
  readonly worm: Context.Tag.Service<typeof WormAuditSink>;
};

function extractService<I, S>(tag: Context.Tag<I, S>, layer: Layer.Layer<I, never, never>): S {
  return Effect.runSync(
    Effect.gen(function* () {
      return yield* tag;
    }).pipe(Effect.provide(layer))
  );
}

/** Build long-lived install services (HookRegistry shared with the MCP proxy pipeline). */
export function createInMemoryPluginHostServices(options?: {
  readonly worm?: Context.Tag.Service<typeof WormAuditSink>;
}): PluginHostServices {
  const hookRegistry = extractService(HookRegistry, InMemoryHookRegistryLive);
  const skillRegistry = extractService(SkillRegistry, InMemorySkillRegistryLive);
  const worm = options?.worm ?? {
    append: () => Effect.void,
  };
  const layer = Layer.mergeAll(
    Layer.succeed(HookRegistry, hookRegistry),
    Layer.succeed(SkillRegistry, skillRegistry),
    NoopVaultSeedLive,
    Layer.succeed(WormAuditSink, worm)
  ) as Layer.Layer<PluginInstallServices, never, never>;
  return { layer, hookRegistry, skillRegistry, worm };
}

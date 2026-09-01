/**
 * Dynamic provider plugin loader — pairs with optionalDependencies.
 * Effect does NOT provide zero-import; this dynamic import does.
 */

import { Effect } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import type { AnyPlugin, ProviderPlugin } from "./provider-types.js";
import { isStandaloneSkillPlugin } from "./provider-types.js";

export type ProviderPluginModule = {
  readonly default?: AnyPlugin;
  readonly plugin?: AnyPlugin;
  readonly providerPlugin?: ProviderPlugin;
};

/**
 * Dynamically import a module specifier and resolve an AnyPlugin export.
 * Use with package.json optionalDependencies so absent plugins fail at import, not at install.
 */
export function loadPluginModuleEffect(
  moduleSpecifier: string
): Effect.Effect<AnyPlugin, ClawQLError> {
  return Effect.tryPromise({
    try: async () => {
      const mod = (await import(moduleSpecifier)) as ProviderPluginModule;
      const plugin = mod.providerPlugin ?? mod.plugin ?? mod.default;
      if (!plugin || typeof plugin !== "object" || !("id" in plugin)) {
        throw new Error(
          `Module ${moduleSpecifier} must export providerPlugin, plugin, or default AnyPlugin`
        );
      }
      return plugin as AnyPlugin;
    },
    catch: (cause) =>
      new ClawQLError({
        reason: `Failed to load plugin module: ${moduleSpecifier}`,
        cause,
      }),
  });
}

export function assertProviderPlugin(
  plugin: AnyPlugin
): Effect.Effect<ProviderPlugin, ClawQLError> {
  return Effect.sync(() => {
    if (isStandaloneSkillPlugin(plugin)) {
      throw new ClawQLError({
        reason: `Plugin ${plugin.id} is a StandaloneSkillPlugin, not a ProviderPlugin`,
      });
    }
    return plugin as ProviderPlugin;
  }).pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        cause instanceof ClawQLError
          ? cause
          : new ClawQLError({ reason: "Invalid provider plugin", cause })
      )
    )
  );
}

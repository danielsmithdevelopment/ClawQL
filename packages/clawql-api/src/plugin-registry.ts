import { Effect } from "effect";
import { PluginAlreadyRegisteredError, type ClawQLError, type Plugin } from "clawql-core";

export class PluginRegistry {
  private readonly plugins = new Map<string, Plugin>();

  register(plugin: Plugin): Effect.Effect<void, PluginAlreadyRegisteredError | ClawQLError> {
    const plugins = this.plugins;
    return Effect.gen(function* () {
      if (plugins.has(plugin.id)) {
        return yield* Effect.fail(new PluginAlreadyRegisteredError({ pluginId: plugin.id }));
      }
      plugins.set(plugin.id, plugin);
      if (plugin.onRegister) {
        yield* plugin.onRegister();
      }
    });
  }

  list(): readonly Plugin[] {
    return [...this.plugins.values()];
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  teardownAll(): Effect.Effect<void, ClawQLError> {
    const plugins = this.plugins;
    return Effect.gen(function* () {
      for (const plugin of plugins.values()) {
        if (plugin.onTeardown) {
          yield* plugin.onTeardown();
        }
      }
      plugins.clear();
    });
  }
}

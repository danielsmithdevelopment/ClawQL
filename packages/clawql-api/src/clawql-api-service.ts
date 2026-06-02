import { Context, Effect } from "effect";
import { PluginAlreadyRegisteredError, type ClawQLError, type Plugin } from "clawql-core";
import { PluginRegistry } from "./plugin-registry.js";

export class ClawQLApi extends Context.Tag("clawql/ClawQLApi")<
  ClawQLApi,
  {
    readonly registerPlugin: (
      plugin: Plugin
    ) => Effect.Effect<void, PluginAlreadyRegisteredError | ClawQLError>;
    readonly listPlugins: () => readonly Plugin[];
  }
>() {}

export function clawqlApiLayer(registry: PluginRegistry) {
  return ClawQLApi.of({
    registerPlugin: (plugin) => registry.register(plugin),
    listPlugins: () => registry.list(),
  });
}

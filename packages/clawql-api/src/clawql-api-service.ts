import { Context, Effect } from "effect";
import {
  PluginAlreadyRegisteredError,
  type ClawQLPluginRegistrationApi,
  type ClawQLError,
  type McpToolAlreadyRegisteredError,
  type Plugin,
} from "clawql-core";
import type { McpToolRegistration } from "./mcp-tool-registry.js";
import { PluginRegistry } from "./plugin-registry.js";

export class ClawQLApi extends Context.Tag("clawql/ClawQLApi")<
  ClawQLApi,
  {
    readonly registerPlugin: (
      plugin: Plugin
    ) => Effect.Effect<
      void,
      PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError
    >;
    readonly listPlugins: () => readonly Plugin[];
    readonly listMcpTools: () => readonly McpToolRegistration[];
  }
>() {}

export function clawqlApiLayer(
  registry: PluginRegistry,
  registrationApi: ClawQLPluginRegistrationApi,
  listMcpTools: () => readonly McpToolRegistration[]
) {
  return ClawQLApi.of({
    registerPlugin: (plugin) => registry.register(plugin, registrationApi),
    listPlugins: () => registry.list(),
    listMcpTools,
  });
}

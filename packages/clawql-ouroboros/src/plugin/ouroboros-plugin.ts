import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
import { Effect } from "effect";
import { ensureOuroborosPoolShutdownHooks, resetOuroborosContextForTests } from "./context.js";
import {
  buildOuroborosMcpToolDefinitions,
  type OuroborosToolDefOptions,
} from "./ouroboros-tool-defs.js";

export type OuroborosPluginOptions = OuroborosToolDefOptions;

export const OUROBOROS_PLUGIN_ID = "clawql-ouroboros";

/**
 * @deprecated Prefer registering Ouroboros via `clawql-harness` `OuroborosPlugin`
 * (MCP composes `makeHarnessLayer`). Kept for library embedders that use the
 * clawql-core Plugin API directly without a harness.
 */
export function createOuroborosPlugin(options: OuroborosPluginOptions = {}): ProviderPlugin {
  return defineRegisteringProviderPlugin({
    id: OUROBOROS_PLUGIN_ID,
    version: "0.2.0",
    description: "Ouroboros evolutionary specification MCP tools",
    register: (api) =>
      Effect.gen(function* () {
        ensureOuroborosPoolShutdownHooks();
        for (const tool of buildOuroborosMcpToolDefinitions(options)) {
          yield* api.registerMcpTool(tool);
        }
      }),
    onTeardown: () => Effect.sync(() => resetOuroborosContextForTests()),
  });
}

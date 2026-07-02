import type { ClawQLError, McpToolAlreadyRegisteredError, PluginAlreadyRegisteredError } from "clawql-core";
import { Effect, Layer } from "effect";
import { ClawQLApi } from "../clawql-api-service.js";
import { createMemoryPlugin } from "./memory-plugin.js";

export type MemoryLayerError = PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError;

/**
 * Effect Layer that registers {@link createMemoryPlugin} via `ClawQLApi.registerPlugin`.
 * Composed at the MCP adapter root when memory is enabled.
 */
export function makeMemoryLayer(): Layer.Layer<never, MemoryLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createMemoryPlugin());
    })
  );
}

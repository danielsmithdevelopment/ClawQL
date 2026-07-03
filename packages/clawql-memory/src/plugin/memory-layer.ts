import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createMemoryPlugin } from "./memory-plugin.js";

export type MemoryLayerError =
  PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError;

/**
 * Effect Layer that registers {@link createMemoryPlugin} via `ClawQLApi.registerPlugin`.
 */
export function makeMemoryLayer(): Layer.Layer<never, MemoryLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createMemoryPlugin());
    })
  );
}

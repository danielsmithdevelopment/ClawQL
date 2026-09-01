import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
  PluginInstallError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createDataPlugin } from "./data-plugin.js";

export type DataLayerError =
  PluginAlreadyRegisteredError | PluginInstallError | ClawQLError | McpToolAlreadyRegisteredError;

/** Effect Layer that registers {@link createDataPlugin} via `ClawQLApi.registerPlugin`. */
export function makeDataLayer(): Layer.Layer<never, DataLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createDataPlugin());
    })
  );
}

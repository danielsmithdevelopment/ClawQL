import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createWebPlugin } from "./web-plugin.js";

export type WebLayerError =
  | PluginAlreadyRegisteredError
  | ClawQLError
  | McpToolAlreadyRegisteredError;

/** Effect Layer that registers {@link createWebPlugin} via `ClawQLApi.registerPlugin`. */
export function makeWebLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<never, WebLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createWebPlugin(env));
    })
  );
}

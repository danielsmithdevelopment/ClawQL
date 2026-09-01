import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
  PluginInstallError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";

import { createObservabilityPlugin } from "./observability-plugin.js";

export type ObservabilityLayerError =
  | PluginAlreadyRegisteredError
  | PluginInstallError
  | ClawQLError
  | McpToolAlreadyRegisteredError;

export type MakeObservabilityLayerOptions = {
  readonly env?: NodeJS.ProcessEnv;
};

/** Effect Layer that registers {@link createObservabilityPlugin} via `ClawQLApi.registerPlugin`. */
export function makeObservabilityLayer(
  options: MakeObservabilityLayerOptions = {}
): Layer.Layer<never, ObservabilityLayerError, ClawQLApi> {
  const env = options.env ?? process.env;
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createObservabilityPlugin({ env }));
    })
  );
}

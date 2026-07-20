import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createOntologyPlugin } from "./ontology-plugin.js";

export type OntologyLayerError =
  | PluginAlreadyRegisteredError
  | ClawQLError
  | McpToolAlreadyRegisteredError;

/** Effect Layer that registers {@link createOntologyPlugin} via `ClawQLApi.registerPlugin`. */
export function makeOntologyLayer(): Layer.Layer<never, OntologyLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createOntologyPlugin());
    })
  );
}

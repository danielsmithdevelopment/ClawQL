import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createOntologyPlugin, type CreateOntologyPluginOptions } from "./ontology-plugin.js";

export type OntologyLayerError =
  | PluginAlreadyRegisteredError
  | ClawQLError
  | McpToolAlreadyRegisteredError;

export type MakeOntologyLayerOptions = CreateOntologyPluginOptions;

/** Effect Layer that registers {@link createOntologyPlugin} via `ClawQLApi.registerPlugin`. */
export function makeOntologyLayer(
  opts: MakeOntologyLayerOptions = {}
): Layer.Layer<never, OntologyLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createOntologyPlugin(opts));
    })
  );
}

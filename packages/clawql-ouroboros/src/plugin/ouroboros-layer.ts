import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi, ExecuteService, SearchService } from "clawql-api";
import { Effect, Layer } from "effect";
import { configureOuroborosPluginDeps } from "./deps.js";
import { createOuroborosPlugin, type OuroborosPluginOptions } from "./ouroboros-plugin.js";

export type OuroborosLayerError =
  PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError | Error;

/**
 * Effect Layer that wires Ouroboros search/execute deps and registers {@link createOuroborosPlugin}.
 */
export function makeOuroborosLayer(
  options: OuroborosPluginOptions = {}
): Layer.Layer<never, OuroborosLayerError, ClawQLApi | SearchService | ExecuteService> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const search = yield* SearchService;
      const execute = yield* ExecuteService;
      configureOuroborosPluginDeps({
        search: (params) =>
          Effect.runPromise(search.search(params)).then(({ formattedText }) => ({
            content: [{ type: "text" as const, text: formattedText }],
          })),
        execute: (params) =>
          Effect.runPromise(execute.execute(params)).then((result) => ({
            content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          })),
      });
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createOuroborosPlugin(options));
    })
  );
}

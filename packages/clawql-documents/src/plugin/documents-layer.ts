import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi, ExecuteService } from "clawql-api";
import { Effect, Layer } from "effect";
import { configureDocumentsPluginDeps } from "./deps.js";
import { createDocumentsPlugin, type CreateDocumentsPluginOptions } from "./documents-plugin.js";

export type DocumentsLayerError =
  PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError | Error;

/**
 * Effect Layer that wires Documents execute deps and registers {@link createDocumentsPlugin}.
 */
export function makeDocumentsLayer(
  options: CreateDocumentsPluginOptions = {}
): Layer.Layer<never, DocumentsLayerError, ClawQLApi | ExecuteService> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const execute = yield* ExecuteService;
      configureDocumentsPluginDeps({
        execute: (params) =>
          Effect.runPromise(execute.execute(params)).then((result) => ({
            content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          })),
      });
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createDocumentsPlugin(options));
    })
  );
}

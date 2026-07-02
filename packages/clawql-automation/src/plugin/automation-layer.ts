import type { ClawQLError, McpToolAlreadyRegisteredError, PluginAlreadyRegisteredError } from "clawql-core";
import { ClawQLApi, ExecuteService } from "clawql-api";
import { Effect, Layer } from "effect";
import { configureAutomationPluginDeps } from "./deps.js";
import { createAutomationPlugin, type CreateAutomationPluginOptions } from "./automation-plugin.js";

export type AutomationLayerError =
  | PluginAlreadyRegisteredError
  | ClawQLError
  | McpToolAlreadyRegisteredError
  | Error;

/**
 * Effect Layer that wires Automation execute deps and registers {@link createAutomationPlugin}.
 */
export function makeAutomationLayer(
  options: CreateAutomationPluginOptions = {}
): Layer.Layer<never, AutomationLayerError, ClawQLApi | ExecuteService> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const execute = yield* ExecuteService;
      configureAutomationPluginDeps({
        execute: (params) =>
          Effect.runPromise(execute.execute(params)).then((result) => ({
            content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          })),
      });
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createAutomationPlugin(options));
    })
  );
}

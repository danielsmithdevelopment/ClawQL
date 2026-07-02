import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createSandboxPlugin } from "./sandbox-plugin.js";

export type SandboxLayerError =
  PluginAlreadyRegisteredError | ClawQLError | McpToolAlreadyRegisteredError;

/** Effect Layer that registers {@link createSandboxPlugin} via `ClawQLApi.registerPlugin`. */
export function makeSandboxLayer(): Layer.Layer<never, SandboxLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createSandboxPlugin());
    })
  );
}

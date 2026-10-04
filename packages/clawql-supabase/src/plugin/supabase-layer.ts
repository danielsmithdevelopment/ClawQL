import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
  PluginInstallError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createSupabasePlugin } from "./supabase-plugin.js";

export type SupabaseLayerError =
  PluginAlreadyRegisteredError | PluginInstallError | ClawQLError | McpToolAlreadyRegisteredError;

/** Effect Layer that registers {@link createSupabasePlugin} via `ClawQLApi.registerPlugin`. */
export function makeSupabaseLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<never, SupabaseLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createSupabasePlugin(env));
    })
  );
}

import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
  PluginInstallError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import { createChatgptExtensionsPlugin } from "./chatgpt-extensions-plugin.js";

export type ChatgptExtensionsLayerError =
  PluginAlreadyRegisteredError | PluginInstallError | ClawQLError | McpToolAlreadyRegisteredError;

/** Effect Layer that registers the ChatGPT extensions plugin marker via ClawQLApi. */
export function makeChatgptExtensionsLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<never, ChatgptExtensionsLayerError, ClawQLApi> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const claw = yield* ClawQLApi;
      yield* claw.registerPlugin(createChatgptExtensionsPlugin(env));
    })
  );
}

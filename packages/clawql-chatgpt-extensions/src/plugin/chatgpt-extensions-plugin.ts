import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
import { Effect } from "effect";
import { isChatgptExtensionsEnabled } from "../config.js";

export const CHATGPT_EXTENSIONS_PLUGIN_ID = "clawql-chatgpt-extensions";

/**
 * Horizontal plugin marker — MCP tools/resources attach via
 * {@link attachChatgptExtensions} on the transport `McpServer` (needs `_meta` + resources).
 */
export function createChatgptExtensionsPlugin(
  env: NodeJS.ProcessEnv = process.env
): ProviderPlugin {
  return defineRegisteringProviderPlugin({
    id: CHATGPT_EXTENSIONS_PLUGIN_ID,
    version: "0.1.0",
    description:
      "ChatGPT MCP Extensions: mentions, settings, mandate forms, Evidence, console, .cqe/.cqk",
    register: (_api) =>
      Effect.sync(() => {
        if (!isChatgptExtensionsEnabled(env)) return;
        // Tools attach on McpServer in attachChatgptExtensions — registration API
        // cannot yet express openai/ui _meta or ui:// resources.
      }),
  });
}

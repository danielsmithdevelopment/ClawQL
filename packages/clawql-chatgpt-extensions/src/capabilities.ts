/**
 * Client capability detection for ChatGPT MCP Extensions.
 *
 * UI-only tools are **omitted** from tools/list for clients that do not advertise
 * MCP Apps / OpenAI extensions support.
 */

export type ClientCapabilitySnapshot = {
  readonly extensions?: Record<string, unknown>;
  readonly experimental?: Record<string, unknown>;
  readonly [key: string]: unknown;
};

export type ChatgptFeatureSupport = {
  readonly settings: boolean;
  readonly elicitation: boolean;
  readonly mentions: boolean;
  readonly mcpApps: boolean;
  readonly fileEntrypoints: boolean;
};

function hasKey(obj: Record<string, unknown> | undefined, key: string): boolean {
  if (!obj) return false;
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Infer which ChatGPT extension surfaces the connecting client supports.
 * When `clientCapabilities` is missing (stdio IDE clients), treat as non-ChatGPT.
 */
export function detectChatgptFeatureSupport(
  clientCapabilities?: ClientCapabilitySnapshot | null
): ChatgptFeatureSupport {
  if (!clientCapabilities) {
    return {
      settings: false,
      elicitation: false,
      mentions: false,
      mcpApps: false,
      fileEntrypoints: false,
    };
  }
  const ext =
    (clientCapabilities.extensions as Record<string, unknown> | undefined) ??
    (clientCapabilities.experimental as Record<string, unknown> | undefined);
  const settings = hasKey(ext, "openai/settings");
  const elicitation = hasKey(ext, "openai/elicitation") || hasKey(ext, "elicitation");
  const mentions = hasKey(ext, "openai/mentions") || hasKey(ext, "mentions/search");
  const mcpApps =
    hasKey(ext, "openai/ui") || hasKey(clientCapabilities, "extensions") || settings || mentions;
  const fileEntrypoints = hasKey(ext, "openai/files") || mcpApps;
  return { settings, elicitation, mentions, mcpApps, fileEntrypoints };
}

/** True when any ChatGPT-facing UI surface should be registered. */
export function shouldExposeUiTools(support: ChatgptFeatureSupport): boolean {
  return support.mcpApps || support.settings || support.mentions || support.fileEntrypoints;
}

/**
 * Discover payload fragment for `capabilities.extensions`.
 * Always advertise settings tool names when the package is enabled so ChatGPT can bind.
 */
export function buildOpenAiDiscoverExtensions(): Record<string, unknown> {
  return {
    "openai/settings": {
      readTool: "clawql_settings_read",
      updateTool: "clawql_settings_update",
    },
  };
}

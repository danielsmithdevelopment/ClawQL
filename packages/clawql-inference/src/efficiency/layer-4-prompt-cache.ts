import type { ChatMessage } from "../gateway.js";

export type PromptCacheHints = {
  /** Stable prefix length in characters (for observability). */
  stablePrefixChars: number;
  /** Anthropic cache_control applied to system blocks. */
  anthropicCacheSystem: boolean;
};

/** Layer 4 — mark stable prefix blocks for provider prompt caching. */
export function applyPromptCacheMarkers(messages: ChatMessage[]): {
  messages: ChatMessage[];
  hints: PromptCacheHints;
} {
  if (messages.length === 0) {
    return { messages, hints: { stablePrefixChars: 0, anthropicCacheSystem: false } };
  }

  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      rest.push(message);
    }
  }

  if (systemParts.length === 0) {
    return {
      messages,
      hints: { stablePrefixChars: 0, anthropicCacheSystem: false },
    };
  }

  const stableSystem = systemParts.join("\n\n");
  return {
    messages: [{ role: "system", content: stableSystem }, ...rest],
    hints: {
      stablePrefixChars: stableSystem.length,
      anthropicCacheSystem: true,
    },
  };
}

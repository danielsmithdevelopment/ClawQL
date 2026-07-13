import type { ChatMessage } from "../gateway.js";

export type ExtensionLayerHints = {
  structuredOutput: boolean;
  tokenBudgetHint?: string;
  prefillOpener?: string;
};

/** Layers 9–11 — structured output hint, token budget signaling, prefill opener. */
export function applyExtensionLayers(input: {
  messages: ChatMessage[];
  maxTokens?: number;
  structuredOutputEnabled: boolean;
  tokenBudgetEnabled: boolean;
  prefillEnabled: boolean;
  prefillOpener: string;
}): { messages: ChatMessage[]; hints: ExtensionLayerHints } {
  let messages = [...input.messages];
  const hints: ExtensionLayerHints = {
    structuredOutput: input.structuredOutputEnabled,
  };

  if (input.tokenBudgetEnabled && input.maxTokens && input.maxTokens > 0) {
    const approxWords = Math.max(8, Math.floor(input.maxTokens * 0.75));
    hints.tokenBudgetHint = `Respond in under ${approxWords} words (~${input.maxTokens} tokens).`;
    messages = [
      {
        role: "system",
        content: hints.tokenBudgetHint,
      },
      ...messages,
    ];
  }

  if (input.structuredOutputEnabled) {
    messages = [
      {
        role: "system",
        content:
          "Prefer concise structured output (JSON, bullet lists, or code) over conversational prose when answering.",
      },
      ...messages,
    ];
  }

  if (input.prefillEnabled && input.prefillOpener) {
    hints.prefillOpener = input.prefillOpener;
    messages = [...messages, { role: "assistant", content: input.prefillOpener }];
  }

  return { messages, hints };
}

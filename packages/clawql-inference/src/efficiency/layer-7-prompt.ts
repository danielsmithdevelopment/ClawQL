import type { ChatMessage } from "../gateway.js";

export type PromptCompressConfig = {
  maxMessageChars: number;
};

const FILLER_LINE_RE =
  /^(?:thanks|thank you|sure|great question|happy to help|let me know)[.!]?\s*$/i;

function dedupeSystem(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "system") {
      out.push(message);
      continue;
    }
    const key = message.content.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(message);
  }
  return out;
}

function compressMessageContent(content: string, maxChars: number): string {
  const normalized = content
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 24)}\n…[clawql:truncated]`;
}

/** Layer 7 — trim redundant prompt tokens before provider call. */
export function compressPrompt(
  messages: ChatMessage[],
  config: PromptCompressConfig
): ChatMessage[] {
  const deduped = dedupeSystem(messages);
  return deduped
    .filter((message) => !FILLER_LINE_RE.test(message.content.trim()))
    .map((message) => ({
      ...message,
      content: compressMessageContent(message.content, config.maxMessageChars),
    }));
}

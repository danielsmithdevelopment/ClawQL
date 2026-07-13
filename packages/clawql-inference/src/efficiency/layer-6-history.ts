import type { ChatMessage } from "../gateway.js";

export type HistoryCompressConfig = {
  maxChars: number;
  keepRecentMessages: number;
};

function estimateChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function summarizeMiddle(messages: ChatMessage[]): string {
  const bullets: string[] = [];
  for (const message of messages) {
    const line = message.content.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const clipped = line.length > 240 ? `${line.slice(0, 237)}...` : line;
    bullets.push(`- [${message.role}] ${clipped}`);
  }
  return bullets.join("\n");
}

/** Layer 6 — replace middle transcript with a compact rolling summary. */
export function compressHistory(
  messages: ChatMessage[],
  config: HistoryCompressConfig
): ChatMessage[] {
  if (messages.length <= config.keepRecentMessages + 1) return messages;
  if (estimateChars(messages) <= config.maxChars) return messages;

  const system = messages.filter((message) => message.role === "system");
  const nonSystem = messages.filter((message) => message.role !== "system");
  if (nonSystem.length <= config.keepRecentMessages) return messages;

  const head = nonSystem.slice(0, 1);
  const tail = nonSystem.slice(-config.keepRecentMessages);
  const middle = nonSystem.slice(1, nonSystem.length - config.keepRecentMessages);
  if (middle.length === 0) return messages;

  const summary: ChatMessage = {
    role: "system",
    content: `## Distilled session context\n${summarizeMiddle(middle)}`,
  };

  return [...system, ...head, summary, ...tail];
}

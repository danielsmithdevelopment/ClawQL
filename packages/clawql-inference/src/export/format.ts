import type { ChatMessage } from "../gateway.js";
import type { InferenceRecord } from "../store/types.js";
import type { ExportFormat } from "./types.js";

function toOpenAiMessages(record: InferenceRecord): ChatMessage[] {
  const messages = [...record.messages];
  if (!messages.some((m) => m.role === "assistant")) {
    messages.push({ role: "assistant", content: record.response });
  }
  return messages;
}

function toAnthropicMessages(record: InferenceRecord): Array<{ role: string; content: string }> {
  return toOpenAiMessages(record).map((m) => ({
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    content: m.content,
  }));
}

function toShareGpt(record: InferenceRecord): {
  conversations: Array<{ from: string; value: string }>;
} {
  const conversations: Array<{ from: string; value: string }> = [];
  for (const message of record.messages) {
    if (message.role === "system") continue;
    conversations.push({
      from: message.role === "assistant" ? "gpt" : "human",
      value: message.content,
    });
  }
  conversations.push({ from: "gpt", value: record.response });
  return { conversations };
}

export function formatExportLine(record: InferenceRecord, format: ExportFormat): string {
  switch (format) {
    case "openai-jsonl":
      return JSON.stringify({ messages: toOpenAiMessages(record) });
    case "anthropic-jsonl":
      return JSON.stringify({ messages: toAnthropicMessages(record) });
    case "sharegpt":
      return JSON.stringify(toShareGpt(record));
    case "portal-bundle":
      // Directory export is handled by writePortalBundle; line format falls back to openai-jsonl.
      return JSON.stringify({ messages: toOpenAiMessages(record) });
    case "raw-jsonl":
      return JSON.stringify(record);
    default: {
      const _exhaustive: never = format;
      return JSON.stringify(_exhaustive);
    }
  }
}

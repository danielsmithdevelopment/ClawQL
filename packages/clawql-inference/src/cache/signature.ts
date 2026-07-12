import { createHash } from "node:crypto";
import type { ChatMessage } from "../gateway.js";

export function buildCacheSignatureText(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role}:${m.content}`).join("\n");
}

export function hashSystemPrompt(messages: ChatMessage[]): string | undefined {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  if (!system) return undefined;
  return createHash("sha256").update(system, "utf8").digest("hex");
}

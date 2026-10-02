import type { ChatMessage } from "../gateway.js";
import { Effect } from "effect";

/** OpenAI chat-format overhead per message (cl100k_base cookbook). */
const TOKENS_PER_MESSAGE = 3;

async function getEncoding(): Promise<{ encode: (s: string) => ArrayLike<number> } | null> {
  try {
    const mod = await import("js-tiktoken");
    return mod.getEncoding("cl100k_base");
  } catch {
    return null;
  }
}

function tokenizeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_INFERENCE_TOKENIZE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

/**
 * Attach cl100k_base token counts to chat messages for flamegraph / export.
 * No-op when CLAWQL_INFERENCE_TOKENIZE=0 or js-tiktoken unavailable.
 */
async function tokenizeChatMessagesAsyncImpl(
  messages: ChatMessage[],
  env: NodeJS.ProcessEnv = process.env
): Promise<ChatMessage[]> {
  if (!tokenizeEnabled(env) || messages.length === 0) return messages;
  const enc = await getEncoding();
  if (!enc) return messages;
  return messages.map((msg) => ({
    ...msg,
    tokens: TOKENS_PER_MESSAGE + enc.encode(msg.content).length,
  }));
}

export function tokenizeChatMessagesAsyncEffect(
  messages: ChatMessage[],
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ChatMessage[], Error> {
  return Effect.tryPromise({
    try: () => tokenizeChatMessagesAsyncImpl(messages, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link tokenizeChatMessagesAsyncEffect} for Effect callers. */
export async function tokenizeChatMessagesAsync(
  messages: ChatMessage[],
  env: NodeJS.ProcessEnv = process.env
): Promise<ChatMessage[]> {
  return Effect.runPromise(tokenizeChatMessagesAsyncEffect(messages, env));
}

/** Sync best-effort: returns messages unchanged unless tokens already set. */
export function tokenizeChatMessagesSync(
  messages: ChatMessage[],
  env: NodeJS.ProcessEnv = process.env
): ChatMessage[] {
  if (!tokenizeEnabled(env) || messages.every((m) => m.tokens != null)) {
    return messages;
  }
  return messages;
}

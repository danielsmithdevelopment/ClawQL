/**
 * Infinity agent_scale–matched conversation shape (pinned commit 341f6c2).
 *
 * Mirrors crates/infinity-agent-core/examples/agent_scale.rs:
 *   CHUNK_TEXT × 12 per completion, tool call + tool result, closing completion.
 * Per turn = 5 messages; TURNS=20 → 100 messages.
 *
 * Used for byte-parity checks and the density runtime arms — not fair-v2's
 * ~1.5 KiB turn-pair padding (that shape understated Infinity history).
 */

import { Effect } from "effect";

/** Exact string from Infinity agent_scale.rs. */
export const INFINITY_CHUNK_TEXT =
  "Reviewed the module and updated the failing case; the assertion now covers the boundary path. ";

export const INFINITY_CHUNKS_PER_COMPLETION = 12;

export const INFINITY_TOOL_RESULT_TEXT =
  "test result: ok. 148 passed; 0 failed; 3 ignored; finished in 21.38s".repeat(5);

export const INFINITY_MATCHED_TURNS = 20;

export const INFINITY_MATCHED_CONTRACT_ID = "infinity-agent-scale-matched-v1" as const;

export type DensityMessageKind = "user" | "assistant" | "tool_call" | "tool_result";

export type DensityMessage = {
  readonly kind: DensityMessageKind;
  readonly id: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolArguments?: Readonly<Record<string, unknown>>;
  readonly toolCallId?: string;
};

export function infinityAssistantCompletionTextEffect(): Effect.Effect<string> {
  return Effect.sync(() => INFINITY_CHUNK_TEXT.repeat(INFINITY_CHUNKS_PER_COMPLETION));
}

export function infinityUserTextEffect(agentId: string, turn: number): Effect.Effect<string> {
  return Effect.sync(
    () =>
      `Turn ${turn}: re-run the affected tests for ${agentId} and summarize any failures ` +
      `along with the modules they belong to.`
  );
}

/**
 * One Infinity-matched turn as five messages (user → asst+tool path → result → close).
 * Callers append these through the density runtime store — never park prebuilt bags.
 */
export function buildInfinityMatchedTurnMessagesEffect(
  agentId: string,
  turn: number,
  toolCallId: string
): Effect.Effect<readonly DensityMessage[]> {
  return Effect.gen(function* () {
    const userText = yield* infinityUserTextEffect(agentId, turn);
    const asst = yield* infinityAssistantCompletionTextEffect();
    return [
      { kind: "user", id: `${agentId}:u:${turn}`, text: userText },
      { kind: "assistant", id: `${agentId}:a1:${turn}`, text: asst },
      {
        kind: "tool_call",
        id: `${agentId}:tc:${turn}`,
        toolCallId,
        toolName: "run_command",
        toolArguments: { command: "cargo test --workspace" },
      },
      {
        kind: "tool_result",
        id: `${agentId}:tr:${turn}`,
        toolCallId,
        text: INFINITY_TOOL_RESULT_TEXT,
      },
      { kind: "assistant", id: `${agentId}:a2:${turn}`, text: asst },
    ] as const;
  });
}

export function serializeDensityMessagesBytesEffect(
  messages: readonly DensityMessage[]
): Effect.Effect<number> {
  return Effect.sync(() => Buffer.byteLength(JSON.stringify(messages), "utf8"));
}

/** Rough UTF-8 payload of text fields only (no JSON framing). */
export function densityMessagesUtf8PayloadEffect(
  messages: readonly DensityMessage[]
): Effect.Effect<number> {
  return Effect.sync(() => {
    let n = 0;
    for (const m of messages) {
      if (m.text) n += Buffer.byteLength(m.text, "utf8");
      if (m.toolName) n += Buffer.byteLength(m.toolName, "utf8");
      if (m.toolArguments) n += Buffer.byteLength(JSON.stringify(m.toolArguments), "utf8");
    }
    return n;
  });
}

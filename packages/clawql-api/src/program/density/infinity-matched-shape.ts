/**
 * Infinity agent_scale–matched conversation shape (unique-per-agent v2).
 *
 * Mirrors agent_scale turn structure (user → asst → tool_call → tool_result → asst)
 * at TURNS=20 → 100 messages, with **unique text per agent/turn/slot** so V8
 * cannot intern/share histories across agents (shared-string footgun).
 *
 * Contract id: infinity-agent-scale-matched-v2
 */

import { Effect } from "effect";

/** Exact base string from Infinity agent_scale.rs (pre-unique suffix). */
export const INFINITY_CHUNK_TEXT =
  "Reviewed the module and updated the failing case; the assertion now covers the boundary path. ";

export const INFINITY_CHUNKS_PER_COMPLETION = 12;

export const INFINITY_TOOL_RESULT_BASE =
  "test result: ok. 148 passed; 0 failed; 3 ignored; finished in 21.38s".repeat(5);

export const INFINITY_MATCHED_TURNS = 20;

/** Fixed-width unique tag so serialized size stays stable across agents. */
export const UNIQUE_TAG_WIDTH = 64;

export const INFINITY_MATCHED_CONTRACT_ID = "infinity-agent-scale-matched-v2" as const;

export type DensityMessageKind = "user" | "assistant" | "tool_call" | "tool_result";

export type DensityMessage = {
  readonly kind: DensityMessageKind;
  readonly id: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolArguments?: Readonly<Record<string, unknown>>;
  readonly toolCallId?: string;
};

/**
 * Build a fixed-width unique tag from agentId/turn/slot.
 * Length is always UNIQUE_TAG_WIDTH (pad or truncate).
 */
export function uniqueTagEffect(
  agentId: string,
  turn: number,
  slot: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    const raw = `${agentId}|${turn}|${slot}|`;
    if (raw.length >= UNIQUE_TAG_WIDTH) return raw.slice(0, UNIQUE_TAG_WIDTH);
    // Pad with deterministic bytes derived from the raw prefix (not a shared constant).
    let pad = "";
    let i = 0;
    while (raw.length + pad.length < UNIQUE_TAG_WIDTH) {
      pad += ((raw.charCodeAt(i % raw.length) + i * 17) % 36).toString(36);
      i += 1;
    }
    return (raw + pad).slice(0, UNIQUE_TAG_WIDTH);
  });
}

/**
 * Embed a unique tag into `base` without changing length: overwrite the last
 * UNIQUE_TAG_WIDTH chars (pad base first if shorter).
 */
export function withUniqueSuffixEffect(base: string, tag: string): Effect.Effect<string> {
  return Effect.sync(() => {
    const t =
      tag.length === UNIQUE_TAG_WIDTH
        ? tag
        : tag.padEnd(UNIQUE_TAG_WIDTH, "0").slice(0, UNIQUE_TAG_WIDTH);
    // Preserve length when base is long enough; otherwise append tag.
    if (base.length >= UNIQUE_TAG_WIDTH) {
      return base.slice(0, base.length - UNIQUE_TAG_WIDTH) + t;
    }
    return base + t;
  });
}

export function infinityAssistantCompletionTextEffect(
  agentId: string,
  turn: number,
  half: 1 | 2
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const base = INFINITY_CHUNK_TEXT.repeat(INFINITY_CHUNKS_PER_COMPLETION);
    const tag = yield* uniqueTagEffect(agentId, turn, `a${half}`);
    return yield* withUniqueSuffixEffect(base, tag);
  });
}

export function infinityToolResultTextEffect(agentId: string, turn: number): Effect.Effect<string> {
  return Effect.gen(function* () {
    const tag = yield* uniqueTagEffect(agentId, turn, "tr");
    return yield* withUniqueSuffixEffect(INFINITY_TOOL_RESULT_BASE, tag);
  });
}

export function infinityUserTextEffect(agentId: string, turn: number): Effect.Effect<string> {
  return Effect.gen(function* () {
    const tag = yield* uniqueTagEffect(agentId, turn, "u");
    const base =
      `Turn ${turn}: re-run the affected tests for ${agentId} and summarize any failures ` +
      `along with the modules they belong to.`;
    // User lines are shorter than UNIQUE_TAG_WIDTH*2; append tag (size grows slightly vs v1).
    return `${base} [${tag}]`;
  });
}

/**
 * One Infinity-matched turn as five messages. Every text field is unique per
 * (agentId, turn, slot) — no shared string references across agents or slots.
 */
export function buildInfinityMatchedTurnMessagesEffect(
  agentId: string,
  turn: number,
  toolCallId: string
): Effect.Effect<readonly DensityMessage[]> {
  return Effect.gen(function* () {
    const userText = yield* infinityUserTextEffect(agentId, turn);
    const asst1 = yield* infinityAssistantCompletionTextEffect(agentId, turn, 1);
    const asst2 = yield* infinityAssistantCompletionTextEffect(agentId, turn, 2);
    const toolResult = yield* infinityToolResultTextEffect(agentId, turn);
    const toolArgsTag = yield* uniqueTagEffect(agentId, turn, "tc");
    return [
      { kind: "user", id: `${agentId}:u:${turn}`, text: userText },
      { kind: "assistant", id: `${agentId}:a1:${turn}`, text: asst1 },
      {
        kind: "tool_call",
        id: `${agentId}:tc:${turn}`,
        toolCallId,
        toolName: "run_command",
        toolArguments: {
          command: "cargo test --workspace",
          // Unique arg so tool_call JSON cannot be shared across agents.
          nonce: toolArgsTag,
        },
      },
      {
        kind: "tool_result",
        id: `${agentId}:tr:${turn}`,
        toolCallId,
        text: toolResult,
      },
      { kind: "assistant", id: `${agentId}:a2:${turn}`, text: asst2 },
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

/** True iff no two messages share the same text reference or equal shared constant. */
export function assertMessagesUniqueAcrossAgentsEffect(
  agentA: readonly DensityMessage[],
  agentB: readonly DensityMessage[]
): Effect.Effect<void> {
  return Effect.sync(() => {
    const textsA = agentA.map((m) => m.text).filter((t): t is string => !!t);
    const textsB = agentB.map((m) => m.text).filter((t): t is string => !!t);
    for (const a of textsA) {
      for (const b of textsB) {
        if (a === b) {
          throw new Error("shared identical message text across agents (string-interning risk)");
        }
      }
    }
    // Within one agent, assistant halves must also differ.
    for (const msgs of [agentA, agentB]) {
      const asst = msgs.filter((m) => m.kind === "assistant").map((m) => m.text);
      if (asst.length >= 2 && asst[0] === asst[1]) {
        throw new Error("assistant halves share identical text within a turn");
      }
    }
  });
}

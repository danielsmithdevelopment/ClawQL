/**
 * WORM bridge for Agent Substrate lifecycle (ADR 0011 §4).
 * Agent Substrate has no ClawQL audit trail — ClawQL appends entries here.
 */

import { Context, Effect, Layer, Ref } from "effect";
import type { AgentSubstrateLifecycleEvent, AgentSubstrateSession } from "./types.js";

export type AgentSubstrateWormEntryType =
  | "AGENT_SUBSTRATE_SESSION_CREATED"
  | "AGENT_SUBSTRATE_SESSION_SUSPENDED"
  | "AGENT_SUBSTRATE_SESSION_RESUMED"
  | "AGENT_SUBSTRATE_SESSION_TERMINATED"
  | "AGENT_SUBSTRATE_EXEC_COMPLETED";

export type AgentSubstrateWormRecord = {
  readonly type: AgentSubstrateWormEntryType;
  readonly sessionId: string;
  readonly runtime?: string;
  readonly state?: string;
  readonly language?: string;
  readonly exitCode?: number;
  readonly success?: boolean;
  readonly resumedFromSuspend?: boolean;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
};

export class AgentSubstrateWormSink extends Context.Tag("clawql/AgentSubstrateWormSink")<
  AgentSubstrateWormSink,
  {
    readonly append: (record: AgentSubstrateWormRecord) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<readonly AgentSubstrateWormRecord[]>;
  }
>() {}

export const InMemoryAgentSubstrateWormSinkLive: Layer.Layer<AgentSubstrateWormSink> =
  Layer.effect(
    AgentSubstrateWormSink,
    Effect.gen(function* () {
      const ref = yield* Ref.make<AgentSubstrateWormRecord[]>([]);
      return {
        append: (record) => Ref.update(ref, (xs) => [...xs, record]),
        list: () => Ref.get(ref),
      };
    })
  );

function sessionRecord(
  type: AgentSubstrateWormEntryType,
  session: AgentSubstrateSession
): AgentSubstrateWormRecord {
  return {
    type,
    sessionId: session.sessionId,
    runtime: session.runtime,
    state: session.state,
    timestamp: new Date().toISOString(),
  };
}

export function recordAgentSubstrateLifecycle(
  event: AgentSubstrateLifecycleEvent
): Effect.Effect<void, never, AgentSubstrateWormSink> {
  return Effect.gen(function* () {
    const worm = yield* AgentSubstrateWormSink;
    switch (event.kind) {
      case "session_created":
        yield* worm.append(sessionRecord("AGENT_SUBSTRATE_SESSION_CREATED", event.session));
        break;
      case "session_suspended":
        yield* worm.append(sessionRecord("AGENT_SUBSTRATE_SESSION_SUSPENDED", event.session));
        break;
      case "session_resumed":
        yield* worm.append(sessionRecord("AGENT_SUBSTRATE_SESSION_RESUMED", event.session));
        break;
      case "session_terminated":
        yield* worm.append(sessionRecord("AGENT_SUBSTRATE_SESSION_TERMINATED", event.session));
        break;
      case "exec_completed":
        yield* worm.append({
          type: "AGENT_SUBSTRATE_EXEC_COMPLETED",
          sessionId: event.sessionId,
          language: event.input.language,
          exitCode: event.result.exitCode,
          success: event.result.success,
          resumedFromSuspend: event.result.resumedFromSuspend,
          runtime: event.result.runtime,
          timestamp: new Date().toISOString(),
        });
        break;
    }
  });
}

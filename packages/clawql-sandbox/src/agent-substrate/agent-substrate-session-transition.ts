/**
 * Explicit Agent Substrate session state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/sandbox/AgentSubstrateSession.tla.
 */

import { Data, Effect } from "effect";
import type { AgentSubstrateSessionState } from "./types.js";

export type AgentSubstrateSessionStateOrNone = AgentSubstrateSessionState | "none";

export type AgentSubstrateSessionEvent =
  | { readonly _tag: "Create" }
  | { readonly _tag: "Suspend" }
  | { readonly _tag: "Resume" }
  | { readonly _tag: "Terminate" };

export class AgentSubstrateSessionIllegalTransition extends Data.TaggedError(
  "AgentSubstrateSessionIllegalTransition"
)<{
  readonly from: AgentSubstrateSessionStateOrNone;
  readonly event: AgentSubstrateSessionEvent["_tag"];
}> {}

export type AgentSubstrateSessionTransition = {
  readonly status: AgentSubstrateSessionState;
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive session transition.
 * - Create: none → running
 * - Suspend: running → suspended; suspended → suspended (idempotent)
 * - Resume: suspended → running; running → running (idempotent)
 * - Terminate: running|suspended → terminated; terminated → terminated (idempotent)
 * Terminated sessions reject Create/Suspend/Resume (no rebirth).
 */
export function transitionAgentSubstrateSession(
  from: AgentSubstrateSessionStateOrNone,
  event: AgentSubstrateSessionEvent
): Effect.Effect<AgentSubstrateSessionTransition, AgentSubstrateSessionIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Create": {
        if (from === "none") {
          return { status: "running" as const, alreadyDone: false };
        }
        return yield* new AgentSubstrateSessionIllegalTransition({ from, event: "Create" });
      }
      case "Suspend": {
        if (from === "running") {
          return { status: "suspended" as const, alreadyDone: false };
        }
        if (from === "suspended") {
          return { status: "suspended" as const, alreadyDone: true };
        }
        return yield* new AgentSubstrateSessionIllegalTransition({ from, event: "Suspend" });
      }
      case "Resume": {
        if (from === "suspended") {
          return { status: "running" as const, alreadyDone: false };
        }
        if (from === "running") {
          return { status: "running" as const, alreadyDone: true };
        }
        return yield* new AgentSubstrateSessionIllegalTransition({ from, event: "Resume" });
      }
      case "Terminate": {
        if (from === "running" || from === "suspended") {
          return { status: "terminated" as const, alreadyDone: false };
        }
        if (from === "terminated") {
          return { status: "terminated" as const, alreadyDone: true };
        }
        return yield* new AgentSubstrateSessionIllegalTransition({ from, event: "Terminate" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionAgentSubstrateSessionSync(
  from: AgentSubstrateSessionStateOrNone,
  event: AgentSubstrateSessionEvent
): AgentSubstrateSessionTransition {
  return Effect.runSync(transitionAgentSubstrateSession(from, event));
}

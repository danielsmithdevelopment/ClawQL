/**
 * Explicit MCP Streamable HTTP session membership state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/mcp/McpHttpSession.tla.
 *
 * Status is map membership for one session id (absent | present).
 * Capacity (CLAWQL_MCP_SESSION_MAX) is checked at the initialize boundary
 * via {@link canAcceptNewMcpHttpSession} before Create.
 */

import { Data, Effect } from "effect";

export type McpHttpSessionStatus = "absent" | "present";

export type McpHttpSessionEvent =
  | { readonly _tag: "Initialize" }
  | { readonly _tag: "Touch" }
  | { readonly _tag: "Close" }
  | { readonly _tag: "IdleEvict" };

export class McpHttpSessionIllegalTransition extends Data.TaggedError(
  "McpHttpSessionIllegalTransition"
)<{
  readonly from: McpHttpSessionStatus;
  readonly event: McpHttpSessionEvent["_tag"];
}> {}

export type McpHttpSessionTransition = {
  readonly status: McpHttpSessionStatus;
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive session-membership transition.
 * - Initialize: absent → present
 * - Touch: present → present (idempotent)
 * - Close / IdleEvict: present → absent; absent → absent (idempotent)
 * Initialize while present is illegal (no sid rebirth — UUIDs are fresh).
 */
export function transitionMcpHttpSession(
  from: McpHttpSessionStatus,
  event: McpHttpSessionEvent
): Effect.Effect<McpHttpSessionTransition, McpHttpSessionIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Initialize": {
        if (from === "absent") {
          return { status: "present" as const, alreadyDone: false };
        }
        return yield* new McpHttpSessionIllegalTransition({ from, event: "Initialize" });
      }
      case "Touch": {
        if (from === "present") {
          return { status: "present" as const, alreadyDone: true };
        }
        return yield* new McpHttpSessionIllegalTransition({ from, event: "Touch" });
      }
      case "Close": {
        if (from === "present") {
          return { status: "absent" as const, alreadyDone: false };
        }
        if (from === "absent") {
          return { status: "absent" as const, alreadyDone: true };
        }
        return yield* new McpHttpSessionIllegalTransition({ from, event: "Close" });
      }
      case "IdleEvict": {
        if (from === "present") {
          return { status: "absent" as const, alreadyDone: false };
        }
        if (from === "absent") {
          return { status: "absent" as const, alreadyDone: true };
        }
        return yield* new McpHttpSessionIllegalTransition({ from, event: "IdleEvict" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionMcpHttpSessionSync(
  from: McpHttpSessionStatus,
  event: McpHttpSessionEvent
): McpHttpSessionTransition {
  return Effect.runSync(transitionMcpHttpSession(from, event));
}

/** Pre-Initialize capacity gate (after idle sweep). */
export function canAcceptNewMcpHttpSession(activeCount: number, max: number): boolean {
  return activeCount < max;
}

export function mcpHttpSessionStatusFromMap(
  transports: { readonly has: (sid: string) => boolean },
  sessionId: string
): McpHttpSessionStatus {
  return transports.has(sessionId) ? "present" : "absent";
}

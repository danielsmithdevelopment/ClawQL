/**
 * Explicit compensation pending-action state machine (HITL 2PC).
 *
 * Single transition function: (status, event) → next status | typed error.
 * Mirrors formal/tla/payments/PaymentsHoldCompensation.tla Confirm/Cancel/Expire.
 */

import { Data, Effect } from "effect";

/** Pending-action lifecycle — single source for the transition table. */
export type PendingActionStatus = "pending" | "executed" | "cancelled" | "expired";

export type PendingActionEvent =
  { readonly _tag: "Confirm" } | { readonly _tag: "Cancel" } | { readonly _tag: "Expire" };

export class PendingActionIllegalTransition extends Data.TaggedError(
  "PendingActionIllegalTransition"
)<{
  readonly from: PendingActionStatus;
  readonly event: PendingActionEvent["_tag"];
}> {}

export type PendingActionTransition = {
  readonly status: PendingActionStatus;
  /** Idempotent no-op (already executed / cancelled / expired). */
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive pending-action transition. Terminal × mismatched events fail with
 * {@link PendingActionIllegalTransition}.
 */
export function transitionPendingAction(
  from: PendingActionStatus,
  event: PendingActionEvent
): Effect.Effect<PendingActionTransition, PendingActionIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Confirm": {
        if (from === "pending") {
          return { status: "executed" as const, alreadyDone: false };
        }
        if (from === "executed") {
          return { status: "executed" as const, alreadyDone: true };
        }
        return yield* new PendingActionIllegalTransition({ from, event: "Confirm" });
      }
      case "Cancel": {
        if (from === "pending") {
          return { status: "cancelled" as const, alreadyDone: false };
        }
        if (from === "cancelled") {
          return { status: "cancelled" as const, alreadyDone: true };
        }
        return yield* new PendingActionIllegalTransition({ from, event: "Cancel" });
      }
      case "Expire": {
        if (from === "pending") {
          return { status: "expired" as const, alreadyDone: false };
        }
        if (from === "expired") {
          return { status: "expired" as const, alreadyDone: true };
        }
        // Already terminal without expiry — leave unchanged as idempotent refuse-to-mutate.
        if (from === "executed" || from === "cancelled") {
          return { status: from, alreadyDone: true };
        }
        return yield* new PendingActionIllegalTransition({ from, event: "Expire" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

/** Sync façade for Promise paths. */
export function transitionPendingActionSync(
  from: PendingActionStatus,
  event: PendingActionEvent
): PendingActionTransition {
  return Effect.runSync(transitionPendingAction(from, event));
}

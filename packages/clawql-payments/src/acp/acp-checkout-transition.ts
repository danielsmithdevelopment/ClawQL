/**
 * Explicit ACP checkout session state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/payments/AcpCheckoutStatus.tla.
 */

import { Data, Effect } from "effect";

/** ACP checkout lifecycle — single source for the transition table. */
export type AcpCheckoutStatus =
  "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled";

export type AcpCheckoutEvent =
  | { readonly _tag: "CreateReady" }
  | { readonly _tag: "MakeReady" }
  | { readonly _tag: "Complete" }
  | { readonly _tag: "Cancel" };

export class AcpCheckoutIllegalTransition extends Data.TaggedError("AcpCheckoutIllegalTransition")<{
  readonly from: AcpCheckoutStatus;
  readonly event: AcpCheckoutEvent["_tag"];
}> {}

export type AcpCheckoutTransition = {
  readonly status: AcpCheckoutStatus;
  /** Idempotent no-op (already completed). */
  readonly alreadyDone: boolean;
};

/** Map pre-create `"none"` into a reportable status for IllegalTransition. */
function reportFrom(from: AcpCheckoutStatus | "none"): AcpCheckoutStatus {
  return from === "none" ? "not_ready_for_payment" : from;
}

/**
 * Exhaustive ACP checkout transition.
 * - CreateReady: none → ready (createSession today)
 * - MakeReady: not_ready → ready
 * - Complete: ready → completed; completed → completed (idempotent)
 * - Cancel: not_ready | ready → canceled
 */
export function transitionAcpCheckout(
  from: AcpCheckoutStatus | "none",
  event: AcpCheckoutEvent
): Effect.Effect<AcpCheckoutTransition, AcpCheckoutIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "CreateReady": {
        if (from === "none") {
          return { status: "ready_for_payment" as const, alreadyDone: false };
        }
        return yield* new AcpCheckoutIllegalTransition({
          from: reportFrom(from),
          event: "CreateReady",
        });
      }
      case "MakeReady": {
        if (from === "not_ready_for_payment") {
          return { status: "ready_for_payment" as const, alreadyDone: false };
        }
        if (from === "ready_for_payment") {
          return { status: "ready_for_payment" as const, alreadyDone: true };
        }
        return yield* new AcpCheckoutIllegalTransition({
          from: reportFrom(from),
          event: "MakeReady",
        });
      }
      case "Complete": {
        if (from === "ready_for_payment") {
          return { status: "completed" as const, alreadyDone: false };
        }
        if (from === "completed") {
          return { status: "completed" as const, alreadyDone: true };
        }
        return yield* new AcpCheckoutIllegalTransition({
          from: reportFrom(from),
          event: "Complete",
        });
      }
      case "Cancel": {
        if (from === "not_ready_for_payment" || from === "ready_for_payment") {
          return { status: "canceled" as const, alreadyDone: false };
        }
        if (from === "canceled") {
          return { status: "canceled" as const, alreadyDone: true };
        }
        return yield* new AcpCheckoutIllegalTransition({
          from: reportFrom(from),
          event: "Cancel",
        });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionAcpCheckoutSync(
  from: AcpCheckoutStatus | "none",
  event: AcpCheckoutEvent
): AcpCheckoutTransition {
  return Effect.runSync(transitionAcpCheckout(from, event));
}

/**
 * Explicit money-request state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/payments/MoneyRequestStatus.tla.
 */

import { Data, Effect } from "effect";

/** Money-request lifecycle — single source for the transition table. */
export type MoneyRequestStatus =
  "pending" | "accepted" | "paid" | "declined" | "cancelled" | "expired";

export type MoneyRequestEvent =
  | { readonly _tag: "Accept" }
  | { readonly _tag: "Pay" }
  | { readonly _tag: "Decline" }
  | { readonly _tag: "Cancel" }
  | { readonly _tag: "Expire" };

export class MoneyRequestIllegalTransition extends Data.TaggedError(
  "MoneyRequestIllegalTransition"
)<{
  readonly from: MoneyRequestStatus;
  readonly event: MoneyRequestEvent["_tag"];
}> {}

export type MoneyRequestTransition = {
  readonly status: MoneyRequestStatus;
  /** Idempotent no-op (already paid). */
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive money-request transition. Terminal statuses (paid / declined /
 * cancelled / expired) reject further progress except Pay on paid (idempotent).
 */
export function transitionMoneyRequest(
  from: MoneyRequestStatus,
  event: MoneyRequestEvent
): Effect.Effect<MoneyRequestTransition, MoneyRequestIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Accept": {
        if (from === "pending") {
          return { status: "accepted" as const, alreadyDone: false };
        }
        return yield* new MoneyRequestIllegalTransition({ from, event: "Accept" });
      }
      case "Pay": {
        if (from === "accepted") {
          return { status: "paid" as const, alreadyDone: false };
        }
        if (from === "paid") {
          return { status: "paid" as const, alreadyDone: true };
        }
        return yield* new MoneyRequestIllegalTransition({ from, event: "Pay" });
      }
      case "Decline": {
        if (from === "pending") {
          return { status: "declined" as const, alreadyDone: false };
        }
        return yield* new MoneyRequestIllegalTransition({ from, event: "Decline" });
      }
      case "Cancel": {
        if (from === "pending" || from === "accepted") {
          return { status: "cancelled" as const, alreadyDone: false };
        }
        return yield* new MoneyRequestIllegalTransition({ from, event: "Cancel" });
      }
      case "Expire": {
        if (from === "pending" || from === "accepted") {
          return { status: "expired" as const, alreadyDone: false };
        }
        // Already terminal — treat as no-op so touchExpired is safe.
        if (from === "expired" || from === "paid" || from === "declined" || from === "cancelled") {
          return { status: from, alreadyDone: true };
        }
        return yield* new MoneyRequestIllegalTransition({ from, event: "Expire" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionMoneyRequestSync(
  from: MoneyRequestStatus,
  event: MoneyRequestEvent
): MoneyRequestTransition {
  return Effect.runSync(transitionMoneyRequest(from, event));
}

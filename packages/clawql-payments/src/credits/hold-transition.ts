/**
 * Explicit credit-hold state machine.
 *
 * Single transition function: (status, event) → next status | typed error.
 * Mirrors formal/tla/payments/PaymentsHoldCompensation.tla Capture/Release.
 * Callers log `from`/`event`/`to` here for conformance against TLC.
 */

import { Data, Effect } from "effect";

/** Hold lifecycle statuses — single source for the transition table. */
export type CreditHoldStatus = "held" | "captured" | "released";

export type CreditHoldEvent = { readonly _tag: "Capture" } | { readonly _tag: "Release" };

export class CreditHoldIllegalTransition extends Data.TaggedError("CreditHoldIllegalTransition")<{
  readonly from: CreditHoldStatus;
  readonly event: CreditHoldEvent["_tag"];
}> {}

export type CreditHoldTransition = {
  readonly status: CreditHoldStatus;
  /** Idempotent no-op (already captured / already released). */
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive hold transition. Illegal combinations fail with
 * {@link CreditHoldIllegalTransition} (e.g. capture after release).
 */
export function transitionCreditHold(
  from: CreditHoldStatus,
  event: CreditHoldEvent
): Effect.Effect<CreditHoldTransition, CreditHoldIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Capture": {
        if (from === "held") {
          return { status: "captured" as const, alreadyDone: false };
        }
        if (from === "captured") {
          return { status: "captured" as const, alreadyDone: true };
        }
        return yield* new CreditHoldIllegalTransition({ from, event: "Capture" });
      }
      case "Release": {
        if (from === "held") {
          return { status: "released" as const, alreadyDone: false };
        }
        if (from === "released") {
          return { status: "released" as const, alreadyDone: true };
        }
        return yield* new CreditHoldIllegalTransition({ from, event: "Release" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

/** Sync façade for lock-held Promise paths that already own the critical section. */
export function transitionCreditHoldSync(
  from: CreditHoldStatus,
  event: CreditHoldEvent
): CreditHoldTransition {
  return Effect.runSync(transitionCreditHold(from, event));
}

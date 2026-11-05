/**
 * Explicit pending custom-source proposal state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/sources/PendingSourceStatus.tla.
 */

import { Data, Effect } from "effect";
import type { PendingSourceStatus } from "./pending-source-types.js";

export type PendingSourceEvent =
  | { readonly _tag: "Propose" }
  | { readonly _tag: "Approve" }
  | { readonly _tag: "Decline" }
  | { readonly _tag: "Expire" };

export class PendingSourceIllegalTransition extends Data.TaggedError(
  "PendingSourceIllegalTransition"
)<{
  readonly from: PendingSourceStatus;
  readonly event: PendingSourceEvent["_tag"];
}> {}

export type PendingSourceTransition = {
  readonly status: PendingSourceStatus;
  readonly alreadyDone: boolean;
};

function reportFrom(from: PendingSourceStatus | "none"): PendingSourceStatus {
  return from === "none" ? "pending" : from;
}

/**
 * Exhaustive pending-source transition.
 * - Propose: none → pending
 * - Approve / Decline: pending → approved | declined
 * - Expire: pending → expired; expired → expired (idempotent)
 */
export function transitionPendingSource(
  from: PendingSourceStatus | "none",
  event: PendingSourceEvent
): Effect.Effect<PendingSourceTransition, PendingSourceIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Propose": {
        if (from === "none") {
          return { status: "pending" as const, alreadyDone: false };
        }
        return yield* new PendingSourceIllegalTransition({
          from: reportFrom(from),
          event: "Propose",
        });
      }
      case "Approve": {
        if (from === "pending") {
          return { status: "approved" as const, alreadyDone: false };
        }
        if (from === "approved") {
          return { status: "approved" as const, alreadyDone: true };
        }
        return yield* new PendingSourceIllegalTransition({
          from: reportFrom(from),
          event: "Approve",
        });
      }
      case "Decline": {
        if (from === "pending") {
          return { status: "declined" as const, alreadyDone: false };
        }
        if (from === "declined") {
          return { status: "declined" as const, alreadyDone: true };
        }
        return yield* new PendingSourceIllegalTransition({
          from: reportFrom(from),
          event: "Decline",
        });
      }
      case "Expire": {
        if (from === "pending") {
          return { status: "expired" as const, alreadyDone: false };
        }
        if (from === "expired") {
          return { status: "expired" as const, alreadyDone: true };
        }
        return yield* new PendingSourceIllegalTransition({
          from: reportFrom(from),
          event: "Expire",
        });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionPendingSourceSync(
  from: PendingSourceStatus | "none",
  event: PendingSourceEvent
): PendingSourceTransition {
  return Effect.runSync(transitionPendingSource(from, event));
}

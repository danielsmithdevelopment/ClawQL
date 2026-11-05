/**
 * Explicit WebMCP draft-candidate state machine.
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/webmcp/WebMcpDraftCandidate.tla.
 */

import { Data, Effect } from "effect";
import type { DraftCandidateStatus } from "../types.js";

export type DraftCandidateEvent =
  | { readonly _tag: "Draft" }
  | { readonly _tag: "Approve" }
  | { readonly _tag: "Reject" }
  | { readonly _tag: "Publish" };

export class DraftCandidateIllegalTransition extends Data.TaggedError(
  "DraftCandidateIllegalTransition"
)<{
  readonly from: DraftCandidateStatus;
  readonly event: DraftCandidateEvent["_tag"];
}> {}

export type DraftCandidateTransition = {
  readonly status: DraftCandidateStatus;
  readonly alreadyDone: boolean;
};

function reportFrom(from: DraftCandidateStatus | "none"): DraftCandidateStatus {
  return from === "none" ? "pending" : from;
}

/**
 * Exhaustive draft-candidate transition.
 * - Draft: none → pending
 * - Approve / Reject: pending → approved | rejected
 * - Publish: approved → published; published → published (idempotent)
 */
export function transitionDraftCandidate(
  from: DraftCandidateStatus | "none",
  event: DraftCandidateEvent
): Effect.Effect<DraftCandidateTransition, DraftCandidateIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Draft": {
        if (from === "none") {
          return { status: "pending" as const, alreadyDone: false };
        }
        return yield* new DraftCandidateIllegalTransition({
          from: reportFrom(from),
          event: "Draft",
        });
      }
      case "Approve": {
        if (from === "pending") {
          return { status: "approved" as const, alreadyDone: false };
        }
        if (from === "approved") {
          return { status: "approved" as const, alreadyDone: true };
        }
        return yield* new DraftCandidateIllegalTransition({
          from: reportFrom(from),
          event: "Approve",
        });
      }
      case "Reject": {
        if (from === "pending") {
          return { status: "rejected" as const, alreadyDone: false };
        }
        if (from === "rejected") {
          return { status: "rejected" as const, alreadyDone: true };
        }
        return yield* new DraftCandidateIllegalTransition({
          from: reportFrom(from),
          event: "Reject",
        });
      }
      case "Publish": {
        if (from === "approved") {
          return { status: "published" as const, alreadyDone: false };
        }
        if (from === "published") {
          return { status: "published" as const, alreadyDone: true };
        }
        return yield* new DraftCandidateIllegalTransition({
          from: reportFrom(from),
          event: "Publish",
        });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionDraftCandidateSync(
  from: DraftCandidateStatus | "none",
  event: DraftCandidateEvent
): DraftCandidateTransition {
  return Effect.runSync(transitionDraftCandidate(from, event));
}

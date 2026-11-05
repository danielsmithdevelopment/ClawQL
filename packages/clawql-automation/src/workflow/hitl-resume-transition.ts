/**
 * Explicit HITL / Argo suspend-resume plane (ClawQL-owned, not full controller).
 *
 * Single transition: (status, event) → next | typed error.
 * Mirrors formal/tla/workflow/HitlResumeIdempotency.tla.
 */

import { Data, Effect } from "effect";

export type HitlResumeStatus = "running" | "suspended" | "terminal";

export type HitlResumeEvent =
  { readonly _tag: "Suspend" } | { readonly _tag: "Resume" } | { readonly _tag: "Complete" };

export class HitlResumeIllegalTransition extends Data.TaggedError("HitlResumeIllegalTransition")<{
  readonly from: HitlResumeStatus;
  readonly event: HitlResumeEvent["_tag"];
}> {}

export type HitlResumeTransition = {
  readonly status: HitlResumeStatus;
  /** Idempotent no-op (e.g. second Resume after webhook+NATS). */
  readonly alreadyDone: boolean;
};

/**
 * Exhaustive HITL resume-plane transition.
 * - Suspend: running → suspended; suspended → suspended (idempotent)
 * - Resume: suspended → running; running|terminal → alreadyDone (soft idempotent)
 * - Complete: running|suspended → terminal; terminal → alreadyDone
 * Suspend from terminal is illegal.
 */
export function transitionHitlResume(
  from: HitlResumeStatus,
  event: HitlResumeEvent
): Effect.Effect<HitlResumeTransition, HitlResumeIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Suspend": {
        if (from === "running") {
          return { status: "suspended" as const, alreadyDone: false };
        }
        if (from === "suspended") {
          return { status: "suspended" as const, alreadyDone: true };
        }
        return yield* new HitlResumeIllegalTransition({ from, event: "Suspend" });
      }
      case "Resume": {
        if (from === "suspended") {
          return { status: "running" as const, alreadyDone: false };
        }
        if (from === "running" || from === "terminal") {
          return { status: from, alreadyDone: true };
        }
        return yield* new HitlResumeIllegalTransition({ from, event: "Resume" });
      }
      case "Complete": {
        if (from === "running" || from === "suspended") {
          return { status: "terminal" as const, alreadyDone: false };
        }
        if (from === "terminal") {
          return { status: "terminal" as const, alreadyDone: true };
        }
        return yield* new HitlResumeIllegalTransition({ from, event: "Complete" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionHitlResumeSync(
  from: HitlResumeStatus,
  event: HitlResumeEvent
): HitlResumeTransition {
  return Effect.runSync(transitionHitlResume(from, event));
}

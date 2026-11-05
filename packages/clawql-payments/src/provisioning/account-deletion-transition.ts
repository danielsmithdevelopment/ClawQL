/**
 * Explicit account-deletion job + step state machines.
 *
 * Aligns with formal/tla/deletion/AccountDeletionWorm.tla (open → completed;
 * ordered steps; finalize after systems complete).
 */

import { Data, Effect } from "effect";
import type {
  AccountDeletionJobStatus,
  AccountDeletionStepStatus,
} from "./account-deletion-job-store.js";

export type AccountDeletionJobEvent =
  | { readonly _tag: "Start" }
  | { readonly _tag: "Fail" }
  | { readonly _tag: "Resume" }
  | { readonly _tag: "Complete" };

export type AccountDeletionStepEvent =
  { readonly _tag: "Complete" } | { readonly _tag: "Skip" } | { readonly _tag: "Fail" };

export class AccountDeletionJobIllegalTransition extends Data.TaggedError(
  "AccountDeletionJobIllegalTransition"
)<{
  readonly from: AccountDeletionJobStatus;
  readonly event: AccountDeletionJobEvent["_tag"];
}> {}

export class AccountDeletionStepIllegalTransition extends Data.TaggedError(
  "AccountDeletionStepIllegalTransition"
)<{
  readonly from: AccountDeletionStepStatus;
  readonly event: AccountDeletionStepEvent["_tag"];
}> {}

export type AccountDeletionJobTransition = {
  readonly status: AccountDeletionJobStatus;
  readonly alreadyDone: boolean;
};

export type AccountDeletionStepTransition = {
  readonly status: AccountDeletionStepStatus;
  readonly alreadyDone: boolean;
};

/**
 * Job graph: pending → in_progress ⇄ failed → completed.
 * Complete is idempotent on completed (ResumeCompleted in the TLA).
 */
export function transitionAccountDeletionJob(
  from: AccountDeletionJobStatus,
  event: AccountDeletionJobEvent
): Effect.Effect<AccountDeletionJobTransition, AccountDeletionJobIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Start": {
        if (from === "pending" || from === "in_progress") {
          return {
            status: "in_progress" as const,
            alreadyDone: from === "in_progress",
          };
        }
        if (from === "failed") {
          return { status: "in_progress" as const, alreadyDone: false };
        }
        return yield* new AccountDeletionJobIllegalTransition({ from, event: "Start" });
      }
      case "Fail": {
        if (from === "in_progress" || from === "pending") {
          return { status: "failed" as const, alreadyDone: false };
        }
        if (from === "failed") {
          return { status: "failed" as const, alreadyDone: true };
        }
        return yield* new AccountDeletionJobIllegalTransition({ from, event: "Fail" });
      }
      case "Resume": {
        if (from === "failed" || from === "pending" || from === "in_progress") {
          return {
            status: "in_progress" as const,
            alreadyDone: from === "in_progress",
          };
        }
        if (from === "completed") {
          return { status: "completed" as const, alreadyDone: true };
        }
        return yield* new AccountDeletionJobIllegalTransition({ from, event: "Resume" });
      }
      case "Complete": {
        if (from === "in_progress" || from === "pending" || from === "failed") {
          return { status: "completed" as const, alreadyDone: false };
        }
        if (from === "completed") {
          return { status: "completed" as const, alreadyDone: true };
        }
        return yield* new AccountDeletionJobIllegalTransition({ from, event: "Complete" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

/**
 * Step graph: pending|failed → completed|skipped|failed.
 * completed/skipped are terminal for stepDone(); failed may retry.
 */
export function transitionAccountDeletionStep(
  from: AccountDeletionStepStatus,
  event: AccountDeletionStepEvent
): Effect.Effect<AccountDeletionStepTransition, AccountDeletionStepIllegalTransition> {
  return Effect.gen(function* () {
    switch (event._tag) {
      case "Complete": {
        if (from === "pending" || from === "failed") {
          return { status: "completed" as const, alreadyDone: false };
        }
        if (from === "completed") {
          return { status: "completed" as const, alreadyDone: true };
        }
        return yield* new AccountDeletionStepIllegalTransition({ from, event: "Complete" });
      }
      case "Skip": {
        if (from === "pending" || from === "failed") {
          return { status: "skipped" as const, alreadyDone: false };
        }
        if (from === "skipped") {
          return { status: "skipped" as const, alreadyDone: true };
        }
        return yield* new AccountDeletionStepIllegalTransition({ from, event: "Skip" });
      }
      case "Fail": {
        if (from === "pending" || from === "failed") {
          return { status: "failed" as const, alreadyDone: from === "failed" };
        }
        return yield* new AccountDeletionStepIllegalTransition({ from, event: "Fail" });
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  });
}

export function transitionAccountDeletionJobSync(
  from: AccountDeletionJobStatus,
  event: AccountDeletionJobEvent
): AccountDeletionJobTransition {
  return Effect.runSync(transitionAccountDeletionJob(from, event));
}

export function transitionAccountDeletionStepSync(
  from: AccountDeletionStepStatus,
  event: AccountDeletionStepEvent
): AccountDeletionStepTransition {
  return Effect.runSync(transitionAccountDeletionStep(from, event));
}

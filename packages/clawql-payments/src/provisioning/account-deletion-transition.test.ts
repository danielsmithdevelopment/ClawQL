import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  AccountDeletionJobIllegalTransition,
  AccountDeletionStepIllegalTransition,
  transitionAccountDeletionJob,
  transitionAccountDeletionJobSync,
  transitionAccountDeletionStep,
  transitionAccountDeletionStepSync,
} from "./account-deletion-transition.js";

describe("transitionAccountDeletionJob", () => {
  it("starts pending → in_progress and completes", () => {
    expect(transitionAccountDeletionJobSync("pending", { _tag: "Start" }).status).toBe(
      "in_progress"
    );
    expect(transitionAccountDeletionJobSync("in_progress", { _tag: "Complete" }).status).toBe(
      "completed"
    );
    expect(transitionAccountDeletionJobSync("completed", { _tag: "Complete" }).alreadyDone).toBe(
      true
    );
  });

  it("fails and resumes", () => {
    expect(transitionAccountDeletionJobSync("in_progress", { _tag: "Fail" }).status).toBe("failed");
    expect(transitionAccountDeletionJobSync("failed", { _tag: "Resume" }).status).toBe(
      "in_progress"
    );
  });

  it("allows Complete from pending (defensive finalize)", () => {
    expect(transitionAccountDeletionJobSync("pending", { _tag: "Complete" }).status).toBe(
      "completed"
    );
  });

  it("rejects start from completed", () => {
    const bad = Effect.runSync(
      Effect.result(transitionAccountDeletionJob("completed", { _tag: "Start" }))
    );
    expect(bad._tag).toBe("Failure");
    if (bad._tag === "Failure") {
      expect(bad.failure).toBeInstanceOf(AccountDeletionJobIllegalTransition);
    }
  });
});

describe("transitionAccountDeletionStep", () => {
  it("completes and skips from pending", () => {
    expect(transitionAccountDeletionStepSync("pending", { _tag: "Complete" }).status).toBe(
      "completed"
    );
    expect(transitionAccountDeletionStepSync("pending", { _tag: "Skip" }).status).toBe("skipped");
  });

  it("allows retry after fail", () => {
    expect(transitionAccountDeletionStepSync("failed", { _tag: "Complete" }).status).toBe(
      "completed"
    );
  });

  it("rejects complete from skipped", () => {
    const bad = Effect.runSync(
      Effect.result(transitionAccountDeletionStep("skipped", { _tag: "Complete" }))
    );
    expect(bad._tag).toBe("Failure");
    if (bad._tag === "Failure") {
      expect(bad.failure).toBeInstanceOf(AccountDeletionStepIllegalTransition);
    }
  });
});

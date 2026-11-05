import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  HitlResumeIllegalTransition,
  transitionHitlResume,
  transitionHitlResumeSync,
} from "./hitl-resume-transition.js";

describe("transitionHitlResume", () => {
  it("suspends and resumes", () => {
    expect(transitionHitlResumeSync("running", { _tag: "Suspend" })).toEqual({
      status: "suspended",
      alreadyDone: false,
    });
    expect(transitionHitlResumeSync("suspended", { _tag: "Resume" })).toEqual({
      status: "running",
      alreadyDone: false,
    });
  });

  it("treats second Resume as alreadyDone (webhook+NATS)", () => {
    expect(transitionHitlResumeSync("running", { _tag: "Resume" })).toEqual({
      status: "running",
      alreadyDone: true,
    });
    expect(transitionHitlResumeSync("terminal", { _tag: "Resume" }).alreadyDone).toBe(true);
  });

  it("rejects Suspend from terminal", () => {
    const bad = Effect.runSync(
      Effect.result(transitionHitlResume("terminal", { _tag: "Suspend" }))
    );
    expect(bad._tag).toBe("Failure");
    if (bad._tag === "Failure") {
      expect(bad.failure).toBeInstanceOf(HitlResumeIllegalTransition);
    }
  });
});

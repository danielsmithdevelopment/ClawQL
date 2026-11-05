import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  DraftCandidateIllegalTransition,
  transitionDraftCandidate,
  transitionDraftCandidateSync,
} from "./draft-candidate-transition.js";

describe("transitionDraftCandidate", () => {
  it("drafts pending", () => {
    expect(transitionDraftCandidateSync("none", { _tag: "Draft" })).toEqual({
      status: "pending",
      alreadyDone: false,
    });
  });

  it("approves/rejects pending; publish only from approved", () => {
    expect(transitionDraftCandidateSync("pending", { _tag: "Approve" }).status).toBe("approved");
    expect(transitionDraftCandidateSync("pending", { _tag: "Reject" }).status).toBe("rejected");
    expect(transitionDraftCandidateSync("approved", { _tag: "Publish" }).status).toBe("published");
    const bad = Effect.runSync(
      Effect.result(transitionDraftCandidate("pending", { _tag: "Publish" }))
    );
    expect(bad._tag).toBe("Failure");
    if (bad._tag === "Failure") {
      expect(bad.failure).toBeInstanceOf(DraftCandidateIllegalTransition);
    }
  });

  it("rejects publish from rejected", () => {
    const bad = Effect.runSync(
      Effect.result(transitionDraftCandidate("rejected", { _tag: "Publish" }))
    );
    expect(bad._tag).toBe("Failure");
  });
});

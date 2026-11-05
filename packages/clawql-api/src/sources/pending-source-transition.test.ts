import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  PendingSourceIllegalTransition,
  transitionPendingSource,
  transitionPendingSourceSync,
} from "./pending-source-transition.js";

describe("transitionPendingSource", () => {
  it("proposes pending", () => {
    expect(transitionPendingSourceSync("none", { _tag: "Propose" })).toEqual({
      status: "pending",
      alreadyDone: false,
    });
  });

  it("approves and declines from pending; idempotent re-approve", () => {
    expect(transitionPendingSourceSync("pending", { _tag: "Approve" }).status).toBe("approved");
    expect(transitionPendingSourceSync("pending", { _tag: "Decline" }).status).toBe("declined");
    expect(transitionPendingSourceSync("approved", { _tag: "Approve" })).toEqual({
      status: "approved",
      alreadyDone: true,
    });
    for (const from of ["declined", "expired"] as const) {
      const bad = Effect.runSync(Effect.result(transitionPendingSource(from, { _tag: "Approve" })));
      expect(bad._tag).toBe("Failure");
      if (bad._tag === "Failure") {
        expect(bad.failure).toBeInstanceOf(PendingSourceIllegalTransition);
      }
    }
  });

  it("expires pending only", () => {
    expect(transitionPendingSourceSync("pending", { _tag: "Expire" }).status).toBe("expired");
    const fromApproved = Effect.runSync(
      Effect.result(transitionPendingSource("approved", { _tag: "Expire" }))
    );
    expect(fromApproved._tag).toBe("Failure");
  });
});

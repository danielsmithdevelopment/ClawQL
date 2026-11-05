import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import {
  PendingActionIllegalTransition,
  transitionPendingAction,
  transitionPendingActionSync,
} from "./pending-action-transition.js";

describe("transitionPendingAction", () => {
  it("pending + Confirm → executed", () => {
    expect(transitionPendingActionSync("pending", { _tag: "Confirm" })).toEqual({
      status: "executed",
      alreadyDone: false,
    });
  });

  it("executed + Confirm → alreadyDone", () => {
    expect(transitionPendingActionSync("executed", { _tag: "Confirm" })).toEqual({
      status: "executed",
      alreadyDone: true,
    });
  });

  it("pending + Cancel → cancelled", () => {
    expect(transitionPendingActionSync("pending", { _tag: "Cancel" })).toEqual({
      status: "cancelled",
      alreadyDone: false,
    });
  });

  it("pending + Expire → expired", () => {
    expect(transitionPendingActionSync("pending", { _tag: "Expire" })).toEqual({
      status: "expired",
      alreadyDone: false,
    });
  });

  it("expired + Confirm is illegal", () => {
    const result = Effect.runSync(
      Effect.result(transitionPendingAction("expired", { _tag: "Confirm" }))
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(PendingActionIllegalTransition);
    }
  });

  it("executed + Expire is idempotent no-op", () => {
    expect(transitionPendingActionSync("executed", { _tag: "Expire" })).toEqual({
      status: "executed",
      alreadyDone: true,
    });
  });
});

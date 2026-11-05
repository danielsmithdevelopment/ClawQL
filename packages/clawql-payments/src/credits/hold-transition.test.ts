import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreditHoldIllegalTransition,
  transitionCreditHold,
  transitionCreditHoldSync,
} from "./hold-transition.js";

describe("transitionCreditHold", () => {
  it("held + Capture → captured", () => {
    expect(transitionCreditHoldSync("held", { _tag: "Capture" })).toEqual({
      status: "captured",
      alreadyDone: false,
    });
  });

  it("captured + Capture → alreadyDone (idempotent)", () => {
    expect(transitionCreditHoldSync("captured", { _tag: "Capture" })).toEqual({
      status: "captured",
      alreadyDone: true,
    });
  });

  it("held + Release → released", () => {
    expect(transitionCreditHoldSync("held", { _tag: "Release" })).toEqual({
      status: "released",
      alreadyDone: false,
    });
  });

  it("released + Release → alreadyDone", () => {
    expect(transitionCreditHoldSync("released", { _tag: "Release" })).toEqual({
      status: "released",
      alreadyDone: true,
    });
  });

  it("released + Capture is illegal", () => {
    const result = Effect.runSync(
      Effect.result(transitionCreditHold("released", { _tag: "Capture" }))
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(CreditHoldIllegalTransition);
      expect(result.failure.from).toBe("released");
      expect(result.failure.event).toBe("Capture");
    }
  });

  it("captured + Release is illegal", () => {
    const result = Effect.runSync(
      Effect.result(transitionCreditHold("captured", { _tag: "Release" }))
    );
    expect(Result.isFailure(result)).toBe(true);
  });
});

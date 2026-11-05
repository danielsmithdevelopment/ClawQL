import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  MoneyRequestIllegalTransition,
  transitionMoneyRequest,
  transitionMoneyRequestSync,
} from "./money-request-transition.js";

describe("transitionMoneyRequest", () => {
  it("accepts pending → accepted", () => {
    expect(transitionMoneyRequestSync("pending", { _tag: "Accept" })).toEqual({
      status: "accepted",
      alreadyDone: false,
    });
  });

  it("pays accepted → paid and idempotent on paid", () => {
    expect(transitionMoneyRequestSync("accepted", { _tag: "Pay" })).toEqual({
      status: "paid",
      alreadyDone: false,
    });
    expect(transitionMoneyRequestSync("paid", { _tag: "Pay" })).toEqual({
      status: "paid",
      alreadyDone: true,
    });
  });

  it("rejects pay from pending (must accept first)", () => {
    const result = Effect.runSync(
      Effect.result(transitionMoneyRequest("pending", { _tag: "Pay" }))
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(MoneyRequestIllegalTransition);
    }
  });

  it("declines pending only", () => {
    expect(transitionMoneyRequestSync("pending", { _tag: "Decline" })).toEqual({
      status: "declined",
      alreadyDone: false,
    });
    const bad = Effect.runSync(
      Effect.result(transitionMoneyRequest("accepted", { _tag: "Decline" }))
    );
    expect(bad._tag).toBe("Failure");
  });

  it("cancels pending or accepted", () => {
    expect(transitionMoneyRequestSync("pending", { _tag: "Cancel" }).status).toBe("cancelled");
    expect(transitionMoneyRequestSync("accepted", { _tag: "Cancel" }).status).toBe("cancelled");
  });

  it("expires pending/accepted; no-op on terminal", () => {
    expect(transitionMoneyRequestSync("pending", { _tag: "Expire" }).status).toBe("expired");
    expect(transitionMoneyRequestSync("paid", { _tag: "Expire" })).toEqual({
      status: "paid",
      alreadyDone: true,
    });
  });
});

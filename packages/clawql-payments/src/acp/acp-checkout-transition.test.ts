import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  AcpCheckoutIllegalTransition,
  transitionAcpCheckout,
  transitionAcpCheckoutSync,
} from "./acp-checkout-transition.js";

describe("transitionAcpCheckout", () => {
  it("creates ready sessions", () => {
    expect(transitionAcpCheckoutSync("none", { _tag: "CreateReady" })).toEqual({
      status: "ready_for_payment",
      alreadyDone: false,
    });
  });

  it("completes ready → completed and is idempotent", () => {
    expect(transitionAcpCheckoutSync("ready_for_payment", { _tag: "Complete" })).toEqual({
      status: "completed",
      alreadyDone: false,
    });
    expect(transitionAcpCheckoutSync("completed", { _tag: "Complete" })).toEqual({
      status: "completed",
      alreadyDone: true,
    });
  });

  it("rejects complete from canceled or not_ready", () => {
    for (const from of ["canceled", "not_ready_for_payment"] as const) {
      const result = Effect.runSync(
        Effect.result(transitionAcpCheckout(from, { _tag: "Complete" }))
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(AcpCheckoutIllegalTransition);
      }
    }
  });

  it("cancels open sessions only", () => {
    expect(transitionAcpCheckoutSync("ready_for_payment", { _tag: "Cancel" }).status).toBe(
      "canceled"
    );
    const bad = Effect.runSync(
      Effect.result(transitionAcpCheckout("completed", { _tag: "Cancel" }))
    );
    expect(bad._tag).toBe("Failure");
  });

  it("makeReady lifts not_ready", () => {
    expect(transitionAcpCheckoutSync("not_ready_for_payment", { _tag: "MakeReady" })).toEqual({
      status: "ready_for_payment",
      alreadyDone: false,
    });
  });
});

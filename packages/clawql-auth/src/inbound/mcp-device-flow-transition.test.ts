import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  DeviceFlowIllegalTransition,
  deviceFlowStatusFromRecord,
  transitionDeviceFlow,
  transitionDeviceFlowSync,
} from "./mcp-device-flow-transition.js";

describe("transitionDeviceFlow", () => {
  it("issues pending sessions", () => {
    expect(transitionDeviceFlowSync("none", { _tag: "Issue" })).toEqual({
      status: "pending",
      alreadyDone: false,
    });
  });

  it("approves pending → approved and is idempotent", () => {
    expect(transitionDeviceFlowSync("pending", { _tag: "Approve" })).toEqual({
      status: "approved",
      alreadyDone: false,
    });
    expect(transitionDeviceFlowSync("approved", { _tag: "Approve" })).toEqual({
      status: "approved",
      alreadyDone: true,
    });
  });

  it("consumes approved only once path", () => {
    expect(transitionDeviceFlowSync("approved", { _tag: "Consume" }).status).toBe("consumed");
    for (const from of ["pending", "consumed", "expired"] as const) {
      const result = Effect.runSync(Effect.result(transitionDeviceFlow(from, { _tag: "Consume" })));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(DeviceFlowIllegalTransition);
      }
    }
  });

  it("expires open codes", () => {
    expect(transitionDeviceFlowSync("pending", { _tag: "Expire" }).status).toBe("expired");
    expect(transitionDeviceFlowSync("approved", { _tag: "Expire" }).status).toBe("expired");
  });

  it("rejects approve after consume/expire", () => {
    for (const from of ["consumed", "expired"] as const) {
      const result = Effect.runSync(Effect.result(transitionDeviceFlow(from, { _tag: "Approve" })));
      expect(result._tag).toBe("Failure");
    }
  });

  it("deviceFlowStatusFromRecord", () => {
    expect(deviceFlowStatusFromRecord({})).toBe("pending");
    expect(deviceFlowStatusFromRecord({ approvedSubject: "u" })).toBe("approved");
  });
});

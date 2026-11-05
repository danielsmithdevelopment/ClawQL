import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  canAcceptNewMcpHttpSession,
  McpHttpSessionIllegalTransition,
  mcpHttpSessionStatusFromMap,
  transitionMcpHttpSession,
  transitionMcpHttpSessionSync,
} from "./mcp-http-session-transition.js";

describe("transitionMcpHttpSession", () => {
  it("initializes then closes", () => {
    expect(transitionMcpHttpSessionSync("absent", { _tag: "Initialize" })).toEqual({
      status: "present",
      alreadyDone: false,
    });
    expect(transitionMcpHttpSessionSync("present", { _tag: "Close" })).toEqual({
      status: "absent",
      alreadyDone: false,
    });
  });

  it("is idempotent for Touch and Close/IdleEvict from absent", () => {
    expect(transitionMcpHttpSessionSync("present", { _tag: "Touch" }).alreadyDone).toBe(true);
    expect(transitionMcpHttpSessionSync("absent", { _tag: "Close" }).alreadyDone).toBe(true);
    expect(transitionMcpHttpSessionSync("absent", { _tag: "IdleEvict" }).alreadyDone).toBe(true);
  });

  it("rejects Initialize while present and Touch while absent", () => {
    const rebirth = Effect.runSync(
      Effect.result(transitionMcpHttpSession("present", { _tag: "Initialize" }))
    );
    expect(rebirth._tag).toBe("Failure");
    if (rebirth._tag === "Failure") {
      expect(rebirth.failure).toBeInstanceOf(McpHttpSessionIllegalTransition);
    }
    const touchAbsent = Effect.runSync(
      Effect.result(transitionMcpHttpSession("absent", { _tag: "Touch" }))
    );
    expect(touchAbsent._tag).toBe("Failure");
  });
});

describe("canAcceptNewMcpHttpSession", () => {
  it("rejects at capacity", () => {
    expect(canAcceptNewMcpHttpSession(0, 2)).toBe(true);
    expect(canAcceptNewMcpHttpSession(2, 2)).toBe(false);
  });
});

describe("mcpHttpSessionStatusFromMap", () => {
  it("reads membership", () => {
    const m = new Map([["s1", true]]);
    expect(mcpHttpSessionStatusFromMap(m, "s1")).toBe("present");
    expect(mcpHttpSessionStatusFromMap(m, "s2")).toBe("absent");
  });
});

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  AgentSubstrateSessionIllegalTransition,
  transitionAgentSubstrateSession,
  transitionAgentSubstrateSessionSync,
} from "./agent-substrate-session-transition.js";

describe("transitionAgentSubstrateSession", () => {
  it("creates from none and suspends/resumes", () => {
    expect(transitionAgentSubstrateSessionSync("none", { _tag: "Create" })).toEqual({
      status: "running",
      alreadyDone: false,
    });
    expect(transitionAgentSubstrateSessionSync("running", { _tag: "Suspend" }).status).toBe(
      "suspended"
    );
    expect(transitionAgentSubstrateSessionSync("suspended", { _tag: "Resume" }).status).toBe(
      "running"
    );
  });

  it("is idempotent for Suspend/Resume/Terminate", () => {
    expect(transitionAgentSubstrateSessionSync("suspended", { _tag: "Suspend" })).toEqual({
      status: "suspended",
      alreadyDone: true,
    });
    expect(transitionAgentSubstrateSessionSync("running", { _tag: "Resume" })).toEqual({
      status: "running",
      alreadyDone: true,
    });
    expect(transitionAgentSubstrateSessionSync("terminated", { _tag: "Terminate" })).toEqual({
      status: "terminated",
      alreadyDone: true,
    });
  });

  it("terminates from running or suspended", () => {
    expect(transitionAgentSubstrateSessionSync("running", { _tag: "Terminate" }).status).toBe(
      "terminated"
    );
    expect(transitionAgentSubstrateSessionSync("suspended", { _tag: "Terminate" }).status).toBe(
      "terminated"
    );
  });

  it("rejects rebirth after terminate and create when present", () => {
    for (const event of [
      { _tag: "Create" as const },
      { _tag: "Suspend" as const },
      { _tag: "Resume" as const },
    ]) {
      const bad = Effect.runSync(
        Effect.result(transitionAgentSubstrateSession("terminated", event))
      );
      expect(bad._tag).toBe("Failure");
      if (bad._tag === "Failure") {
        expect(bad.failure).toBeInstanceOf(AgentSubstrateSessionIllegalTransition);
      }
    }
    const createAgain = Effect.runSync(
      Effect.result(transitionAgentSubstrateSession("running", { _tag: "Create" }))
    );
    expect(createAgain._tag).toBe("Failure");
  });
});

import { describe, expect, it } from "vitest";
import { doctorChecksFromRuntimeLadder } from "./runtime-ladder-prompt.js";
import type { RuntimeLadderDecision } from "clawql-api";

describe("runtime-ladder doctor checks", () => {
  it("surfaces node improve hint in detail", () => {
    const decision: RuntimeLadderDecision = {
      tier: "node",
      celldPresent: false,
      bunPresent: false,
      celldDeclined: true,
      bunDeclined: true,
      messages: ["On Node (legacy host). Improve isolation: install celld"],
      installCelldHint: "install celld",
      installBunHint: "install bun",
      honesty: "tier=node (legacy)",
    };
    const checks = doctorChecksFromRuntimeLadder(decision);
    expect(checks[0]!.level).toBe("warn");
    expect(checks[0]!.message).toMatch(/node/);
    expect(checks[0]!.detail).toMatch(/celld/);
  });
});

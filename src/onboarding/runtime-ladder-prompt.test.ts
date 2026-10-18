import { describe, expect, it } from "vitest";
import { decideRuntimeLadder } from "clawql-api";
import {
  doctorChecksFromRuntimeLadder,
  runRuntimeLadderInteractive,
} from "./runtime-ladder-prompt.js";
import type { RuntimeLadderDecision } from "clawql-api";

describe("runtime-ladder doctor checks", () => {
  it("surfaces node improve hint in detail", () => {
    const decision: RuntimeLadderDecision = {
      tier: "node",
      celldPresent: false,
      bunPresent: false,
      celldDeclined: true,
      bunDeclined: true,
      messages: [
        "On Node (legacy host). You can improve isolation and performance with the preceding options",
      ],
      installCelldHint: "install celld",
      installBunHint: "install bun",
      honesty: "tier=node (legacy)",
    };
    const checks = doctorChecksFromRuntimeLadder(decision);
    expect(checks[0]!.level).toBe("warn");
    expect(checks[0]!.message).toMatch(/node/);
    expect(checks[0]!.detail).toMatch(/isolation and performance/);
  });

  it("non-interactive resolve does not invent refuse env flags", async () => {
    const { env } = await runRuntimeLadderInteractive({}, { interactive: false });
    expect(env.CLAWQL_DECLINE_CELLD).toBeUndefined();
    expect(env.CLAWQL_DECLINE_BUN).toBeUndefined();
  });

  it("refuse flags alone drive bun then node rungs", () => {
    const afterCelldRefuse = decideRuntimeLadder({
      celldPresent: false,
      celldVersion: null,
      bunPresent: true,
      bunVersion: "1.2.0",
      celldDeclined: true,
      bunDeclined: false,
    });
    expect(afterCelldRefuse.tier).toBe("bun");

    const afterBunRefuse = decideRuntimeLadder({
      celldPresent: false,
      celldVersion: null,
      bunPresent: false,
      bunVersion: null,
      celldDeclined: true,
      bunDeclined: true,
    });
    expect(afterBunRefuse.tier).toBe("node");
    expect(afterBunRefuse.messages.join("\n")).toMatch(/isolation and performance/);
  });
});

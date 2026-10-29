import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildFairParkedAgentEffect,
  fairAgentEncodedBytesEffect,
  fairTurnCountEffect,
} from "./fair-agent.js";

describe("fair-agent payload", () => {
  it("builds 20 turn-pairs (40 messages) with pending tool near targets", async () => {
    const turns = await Effect.runPromise(fairTurnCountEffect());
    expect(turns).toBe(20);
    const agent = await Effect.runPromise(buildFairParkedAgentEffect(7));
    expect(agent.status).toBe("parked");
    expect(agent.version).toBe(2);
    expect(agent.turns).toHaveLength(40);
    expect(agent.pendingTool.name).toBe("execute");
    expect(agent.pendingTool.approvalId.startsWith("appr_")).toBe(true);
    expect(Date.parse(agent.wakeDeadlineAt)).toBeGreaterThan(Date.parse(agent.parkedAt) - 1);

    const bytes = await Effect.runPromise(fairAgentEncodedBytesEffect(agent));
    // ~30 KiB disk target band (Ontologiql public claim ~30 KiB/agent).
    expect(bytes).toBeGreaterThan(20 * 1024);
    expect(bytes).toBeLessThan(50 * 1024);
  });
});

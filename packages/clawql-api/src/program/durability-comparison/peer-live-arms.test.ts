import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { golemArm, piDurableArm } from "./peer-live-arms.js";

describe("peer-live-arms", () => {
  it("stays pending_invite without DURABILITY_COMPARISON_LIVE_PEERS", async () => {
    const prev = process.env.DURABILITY_COMPARISON_LIVE_PEERS;
    delete process.env.DURABILITY_COMPARISON_LIVE_PEERS;
    try {
      const golem = await Effect.runPromise(golemArm.run({ n: 1 }));
      const pi = await Effect.runPromise(piDurableArm.run({ n: 1 }));
      expect(golem.status).toBe("pending_invite");
      expect(pi.status).toBe("pending_invite");
      expect(golem.honesty).toMatch(/LIVE_PEERS/);
      expect(pi.honesty).toMatch(/LIVE_PEERS/);
    } finally {
      if (prev === undefined) delete process.env.DURABILITY_COMPARISON_LIVE_PEERS;
      else process.env.DURABILITY_COMPARISON_LIVE_PEERS = prev;
    }
  });
});

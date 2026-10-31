import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  golemArm,
  piDurableAlwaysRetryArm,
  piDurableNeverRetryArm,
  piDurableRealModelArm,
} from "./peer-live-arms.js";

describe("peer-live-arms", () => {
  it("stays pending_invite without DURABILITY_COMPARISON_LIVE_PEERS", async () => {
    const prev = process.env.DURABILITY_COMPARISON_LIVE_PEERS;
    const prevReal = process.env.DURABILITY_COMPARISON_PI_REAL_MODEL;
    delete process.env.DURABILITY_COMPARISON_LIVE_PEERS;
    delete process.env.DURABILITY_COMPARISON_PI_REAL_MODEL;
    try {
      const golem = await Effect.runPromise(golemArm.run({ n: 1 }));
      const never = await Effect.runPromise(piDurableNeverRetryArm.run({ n: 1 }));
      const always = await Effect.runPromise(piDurableAlwaysRetryArm.run({ n: 1 }));
      const real = await Effect.runPromise(piDurableRealModelArm.run({ n: 1 }));
      expect(golem.status).toBe("pending_invite");
      expect(never.status).toBe("pending_invite");
      expect(always.status).toBe("pending_invite");
      expect(real.status).toBe("pending_invite");
      expect(golem.honesty).toMatch(/LIVE_PEERS/);
      expect(never.honesty).toMatch(/LIVE_PEERS/);
      expect(always.honesty).toMatch(/LIVE_PEERS/);
    } finally {
      if (prev === undefined) delete process.env.DURABILITY_COMPARISON_LIVE_PEERS;
      else process.env.DURABILITY_COMPARISON_LIVE_PEERS = prev;
      if (prevReal === undefined) delete process.env.DURABILITY_COMPARISON_PI_REAL_MODEL;
      else process.env.DURABILITY_COMPARISON_PI_REAL_MODEL = prevReal;
    }
  });
});

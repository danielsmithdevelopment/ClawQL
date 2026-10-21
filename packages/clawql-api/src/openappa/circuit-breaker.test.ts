import { describe, expect, it, beforeEach } from "vitest";
import { Effect } from "effect";
import {
  openAppaCircuitBeforeCallEffect,
  openAppaCircuitRecordFailureEffect,
  openAppaCircuitRecordSuccessEffect,
  openAppaCircuitStateEffect,
  resetOpenAppaCircuitBreakersForTests,
} from "./circuit-breaker.js";

describe("OpenAPPA circuit breaker", () => {
  beforeEach(() => {
    resetOpenAppaCircuitBreakersForTests();
  });

  const cfg = { failureThreshold: 3, cooldownMs: 1000 };

  it("opens after consecutive failures and fails closed without waiting", async () => {
    const key = "http://127.0.0.1:9";
    for (let i = 0; i < 3; i++) {
      await Effect.runPromise(openAppaCircuitRecordFailureEffect(key, cfg, 1_000 + i));
    }
    const state = await Effect.runPromise(openAppaCircuitStateEffect(key, 1_010));
    expect(state).toBe("open");
    const block = await Effect.runPromise(openAppaCircuitBeforeCallEffect(key, cfg, 1_010));
    expect(block).toMatch(/circuit open/);
  });

  it("allows one half-open probe after cooldown then closes on success", async () => {
    const key = "http://127.0.0.1:10";
    for (let i = 0; i < 3; i++) {
      await Effect.runPromise(openAppaCircuitRecordFailureEffect(key, cfg, 0));
    }
    // cooldown ended at 1000
    const probe = await Effect.runPromise(openAppaCircuitBeforeCallEffect(key, cfg, 1_001));
    expect(probe).toBeNull();
    const second = await Effect.runPromise(openAppaCircuitBeforeCallEffect(key, cfg, 1_002));
    expect(second).toMatch(/probe already in flight/);
    await Effect.runPromise(openAppaCircuitRecordSuccessEffect(key));
    const state = await Effect.runPromise(openAppaCircuitStateEffect(key, 1_003));
    expect(state).toBe("closed");
  });
});

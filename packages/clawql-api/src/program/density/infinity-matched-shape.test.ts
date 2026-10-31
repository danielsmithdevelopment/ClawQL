import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  assertMessagesUniqueAcrossAgentsEffect,
  buildInfinityMatchedTurnMessagesEffect,
  INFINITY_MATCHED_TURNS,
  serializeDensityMessagesBytesEffect,
} from "./infinity-matched-shape.js";
import { fitCapIntegrityEffect, slopeIntegrityEffect } from "./infinity-harness-v2.js";

describe("infinity-matched-shape v2 unique content", () => {
  it("builds 100 unique-per-slot messages near Infinity byte scale", async () => {
    const messages = [];
    for (let t = 0; t < INFINITY_MATCHED_TURNS; t++) {
      const batch = await Effect.runPromise(
        buildInfinityMatchedTurnMessagesEffect("agent-0", t, `tool-${t}`)
      );
      expect(batch).toHaveLength(5);
      messages.push(...batch);
    }
    expect(messages).toHaveLength(100);
    const bytes = await Effect.runPromise(serializeDensityMessagesBytesEffect(messages));
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(100_000);
  });

  it("does not share identical text across two agents", async () => {
    const a = [];
    const b = [];
    for (let t = 0; t < INFINITY_MATCHED_TURNS; t++) {
      a.push(
        ...(await Effect.runPromise(
          buildInfinityMatchedTurnMessagesEffect("agent-0", t, `tool-a-${t}`)
        ))
      );
      b.push(
        ...(await Effect.runPromise(
          buildInfinityMatchedTurnMessagesEffect("agent-1", t, `tool-b-${t}`)
        ))
      );
    }
    await Effect.runPromise(assertMessagesUniqueAcrossAgentsEffect(a, b));
  });

  it("rejects resident slope below history size (shared-string guard)", async () => {
    const bad = await Effect.runPromise(
      slopeIntegrityEffect({
        historySerializedBytes: 61_761,
        measuredKiBPerAgent: 52.1,
        kind: "resident_rss_slope",
      })
    );
    expect(bad.ok).toBe(false);
    const good = await Effect.runPromise(
      slopeIntegrityEffect({
        historySerializedBytes: 61_761,
        measuredKiBPerAgent: 70,
        kind: "resident_rss_slope",
      })
    );
    expect(good.ok).toBe(true);
  });

  it("rejects lastFit × slope above memory cap", async () => {
    const bad = await Effect.runPromise(
      fitCapIntegrityEffect({
        lastFitAgents: 102_500,
        slopeKiBPerAgent: 98.7,
        memoryMaxBytes: 8 * 1024 * 1024 * 1024,
      })
    );
    expect(bad.ok).toBe(false);
    const good = await Effect.runPromise(
      fitCapIntegrityEffect({
        lastFitAgents: 77_500,
        slopeKiBPerAgent: 102.9,
        memoryMaxBytes: 8 * 1024 * 1024 * 1024,
      })
    );
    expect(good.ok).toBe(true);
  });
});

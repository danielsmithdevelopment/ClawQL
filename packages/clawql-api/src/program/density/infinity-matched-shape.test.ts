import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  buildInfinityMatchedTurnMessagesEffect,
  INFINITY_MATCHED_TURNS,
  serializeDensityMessagesBytesEffect,
} from "./infinity-matched-shape.js";

describe("infinity-matched-shape", () => {
  it("builds 100 messages for 20 turns with stable serialized size near Infinity fixture", async () => {
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
    // Infinity fixture serde_json msgs ≈ 62371 B; ClawQL JSON schema differs slightly
    // but must be same order of magnitude (not fair-v2's ~32 KiB).
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(90_000);
  });
});

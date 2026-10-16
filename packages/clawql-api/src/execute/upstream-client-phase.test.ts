import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  classifyUpstreamPhase,
  formatUpstreamPhaseLog,
  type UpstreamClientPhaseSlot,
} from "./upstream-client-phase.js";

function slot(partial: Partial<UpstreamClientPhaseSlot> & Pick<UpstreamClientPhaseSlot, "issueMs">): UpstreamClientPhaseSlot {
  return {
    id: 1,
    issueIso: "2026-10-13T00:00:00.000Z",
    url: "http://127.0.0.1/x",
    backend: "node-fetch",
    ...partial,
  };
}

describe("classifyUpstreamPhase", () => {
  it("flags write_late when client start is delayed", () => {
    const s = slot({ issueMs: 1000, clientStartMs: 1400, clientStartIso: "t" });
    const b = Effect.runSync(
      classifyUpstreamPhase(s, { tFetch0: 1000, tHeaders: 1410, tDone: 1420 })
    );
    expect(b.classification).toBe("write_late");
    expect(b.write_delay_ms).toBeCloseTo(400, 0);
  });

  it("flags wire_or_mock when headers wait dominates", () => {
    const s = slot({ issueMs: 1000, clientStartMs: 1001, clientStartIso: "t" });
    const b = Effect.runSync(
      classifyUpstreamPhase(s, { tFetch0: 1000, tHeaders: 1500, tDone: 1510 })
    );
    expect(b.classification).toBe("wire_or_mock");
  });

  it("flags read_late when body parse dominates", () => {
    const s = slot({ issueMs: 1000, clientStartMs: 1001, clientStartIso: "t" });
    const b = Effect.runSync(
      classifyUpstreamPhase(s, { tFetch0: 1000, tHeaders: 1010, tDone: 1510 })
    );
    expect(b.classification).toBe("read_late");
    expect(formatUpstreamPhaseLog(s, b, { total_ms: 510 })).toContain("class=read_late");
  });
});

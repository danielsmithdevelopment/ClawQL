import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { wormInputFromObservabilityGovernanceEvent } from "./audit-bridge.js";

describe("observability audit bridge", () => {
  it("maps governance events to WORM metadata", async () => {
    const input = await Effect.runPromise(
      wormInputFromObservabilityGovernanceEvent({
        type: "OBSERVABILITY_RAW_DATA_ACCESSED",
        actorId: "reader-1",
        timestamp: "2026-09-01T00:00:00.000Z",
        signalType: "log",
        providerId: "loki-default",
      })
    );

    expect(input.type).toBe("OBSERVABILITY_RAW_DATA_ACCESSED");
    expect(input.sessionId).toBe("reader-1");
    expect(input.metadata).toMatchObject({
      source: "observability",
      signalType: "log",
      providerId: "loki-default",
    });
  });
});

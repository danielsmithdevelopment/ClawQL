import { describe, expect, it } from "vitest";

import { EPHEMERAL_DURATION_THRESHOLD_MS, selectTransport } from "./selector.js";

describe("selectTransport", () => {
  it("uses headscale for known fleet nodes", () => {
    expect(selectTransport({ targetType: "known-fleet-node" })).toBe("headscale-mesh");
  });

  it("uses tailcat for explicit ephemeral peers", () => {
    expect(selectTransport({ targetType: "ephemeral-peer" })).toBe("tailcat");
  });

  it("uses tailcat for very short expected durations", () => {
    expect(
      selectTransport({
        targetType: "unknown",
        expectedDurationMs: EPHEMERAL_DURATION_THRESHOLD_MS - 1,
      })
    ).toBe("tailcat");
  });

  it("defaults unknown targets to headscale mesh", () => {
    expect(selectTransport({ targetType: "unknown" })).toBe("headscale-mesh");
    expect(
      selectTransport({
        targetType: "unknown",
        expectedDurationMs: EPHEMERAL_DURATION_THRESHOLD_MS,
      })
    ).toBe("headscale-mesh");
  });
});

import { describe, expect, it } from "vitest";

import { selectTransport } from "./selector.js";

describe("selectTransport (v0.2)", () => {
  it("uses headscale for known fleet nodes", () => {
    expect(selectTransport({ targetType: "known-fleet-node" })).toBe("headscale-mesh");
  });

  it("uses customer-tailnet for customer tailnet services", () => {
    expect(selectTransport({ targetType: "customer-tailnet-service" })).toBe(
      "customer-tailnet",
    );
  });

  it("uses tailcat for explicit ephemeral peers", () => {
    expect(selectTransport({ targetType: "ephemeral-peer" })).toBe("tailcat");
  });

  it("never lets short expectedDuration select tailcat for unknown targets", () => {
    expect(
      selectTransport({
        targetType: "unknown",
        expectedDurationMs: 1,
      }),
    ).toBe("headscale-mesh");
  });

  it("defaults unknown targets to headscale mesh", () => {
    expect(selectTransport({ targetType: "unknown" })).toBe("headscale-mesh");
  });
});

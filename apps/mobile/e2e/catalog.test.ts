import { describe, expect, it } from "vitest";

import { assertMobileCatalogComplete, MOBILE_SCENARIOS } from "../maestro/catalog";

describe("MOBILE_SCENARIOS catalog", () => {
  it("is complete (30 Maestro + 2 Manual)", () => {
    expect(() => assertMobileCatalogComplete()).not.toThrow();
    expect(MOBILE_SCENARIOS.filter((s) => s.run === "Maestro")).toHaveLength(30);
    expect(MOBILE_SCENARIOS.filter((s) => s.run === "Manual")).toHaveLength(2);
  });
});

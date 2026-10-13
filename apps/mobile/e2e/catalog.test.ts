import { describe, expect, it } from "vitest";

import { assertMobileCatalogComplete, MOBILE_SCENARIOS } from "../maestro/catalog";

describe("MOBILE_SCENARIOS catalog", () => {
  it("is complete (23 Maestro + 2 Manual)", () => {
    expect(() => assertMobileCatalogComplete()).not.toThrow();
    expect(MOBILE_SCENARIOS.filter((s) => s.run === "Maestro")).toHaveLength(23);
    expect(MOBILE_SCENARIOS.filter((s) => s.run === "Manual")).toHaveLength(2);
  });
});

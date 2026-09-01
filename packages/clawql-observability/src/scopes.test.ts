import { describe, expect, it } from "vitest";

import { hasObservabilityScope } from "./scopes.js";

describe("hasObservabilityScope", () => {
  it("accepts wildcard scope", () => {
    expect(hasObservabilityScope({ sub: "local", scope: ["*"] }, "observability:query_logs")).toBe(
      true
    );
  });

  it("requires exact scope otherwise", () => {
    expect(
      hasObservabilityScope(
        { sub: "reader", scope: ["observability:query_metrics"] },
        "observability:query_logs"
      )
    ).toBe(false);
  });
});

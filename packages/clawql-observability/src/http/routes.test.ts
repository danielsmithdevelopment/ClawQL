import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { handleObservabilityHttpRequestEffect } from "./routes.js";

describe("observability HTTP routes", () => {
  it("returns 404 for unknown paths", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect({
        method: "GET",
        url: "/observability/unknown",
        headers: {},
      })
    );

    expect(response.status).toBe(404);
  });

  it("requires API key when configured", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "GET",
          url: "/observability/health",
          headers: {},
        },
        { CLAWQL_OBSERVABILITY_API_KEY: "secret-key" }
      )
    );

    expect(response.status).toBe(401);
  });
});

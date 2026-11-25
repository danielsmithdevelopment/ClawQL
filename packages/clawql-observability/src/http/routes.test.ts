import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { handleObservabilityHttpRequestEffect } from "./routes.js";

describe("observability HTTP routes", () => {
  it("returns 404 for unknown paths when unauthenticated allowed", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "GET",
          url: "/observability/unknown",
          headers: {},
        },
        { CLAWQL_OBSERVABILITY_ALLOW_UNAUTHENTICATED: "1" }
      )
    );

    expect(response.status).toBe(404);
  });

  it("health stays open without API key (kube probes)", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "GET",
          url: "/observability/health",
          headers: {},
        },
        {}
      )
    );
    // May be 200 or 500 depending on host layers; must not be 401.
    expect(response.status).not.toBe(401);
  });

  it("requires API key when configured (audit 5.03)", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "POST",
          url: "/observability/query/logs",
          headers: {},
          body: {},
        },
        { CLAWQL_OBSERVABILITY_API_KEY: "secret-key" }
      )
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when API key unset (audit 5.03)", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "POST",
          url: "/observability/query/logs",
          headers: {},
          body: {},
        },
        {}
      )
    );

    expect(response.status).toBe(401);
    expect(String((response.body as { error?: string }).error)).toMatch(
      /CLAWQL_OBSERVABILITY_API_KEY/i
    );
  });

  it("refuses alloy apply outside alloy dir (audit 5.03)", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "POST",
          url: "/observability/alloy/apply",
          headers: { authorization: "ApiKey secret-key" },
          body: { outputPath: "/etc/passwd" },
        },
        { CLAWQL_OBSERVABILITY_API_KEY: "secret-key" }
      )
    );

    expect(response.status).toBe(500);
    expect(String((response.body as { reason?: string }).reason ?? JSON.stringify(response.body))).toMatch(
      /outputPath refused|alloy/i
    );
  });

  it("refuses alloy apply to non-.river sibling under package (audit W5)", async () => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: "POST",
          url: "/observability/alloy/apply",
          headers: { authorization: "ApiKey secret-key" },
          body: { outputPath: "package.json" },
        },
        { CLAWQL_OBSERVABILITY_API_KEY: "secret-key" }
      )
    );

    expect(response.status).toBe(500);
    expect(String((response.body as { reason?: string }).reason ?? JSON.stringify(response.body))).toMatch(
      /outputPath refused|\.river/i
    );
  });
});

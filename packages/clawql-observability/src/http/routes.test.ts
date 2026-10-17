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

  it("serves demo span flamegraph HTML and JSON", async () => {
    const html = await Effect.runPromise(
      handleObservabilityHttpRequestEffect({
        method: "GET",
        url: "/observability/flame/trace/demo",
        headers: {},
      })
    );
    expect(html.status).toBe(200);
    expect(html.headers?.["content-type"]).toContain("text/html");
    expect(String(html.body)).toContain("Trace flamegraph");
    expect(String(html.body)).toContain("demo-mcp-execute");

    const jsonRes = await Effect.runPromise(
      handleObservabilityHttpRequestEffect({
        method: "GET",
        url: "/observability/flame/trace/demo?format=json",
        headers: {},
      })
    );
    expect(jsonRes.status).toBe(200);
    const body = jsonRes.body as {
      format: string;
      spanCount: number;
      uiPath: string;
      mostSelfTime: unknown[];
    };
    expect(body.format).toBe("otel-span-flamegraph");
    expect(body.spanCount).toBeGreaterThan(0);
    expect(body.uiPath).toContain("/observability/flame/trace/");
    expect(body.mostSelfTime.length).toBeGreaterThan(0);
  });
});

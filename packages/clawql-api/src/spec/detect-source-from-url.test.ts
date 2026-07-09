import { describe, expect, it } from "vitest";
import { detectSourceFromUrl } from "./detect-source-from-url.js";

describe("detectSourceFromUrl", () => {
  it("detects OpenAPI 3 from JSON body", async () => {
    const body = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Petstore", version: "1.0.0" },
      paths: {},
    });
    const out = await detectSourceFromUrl("https://example.com/openapi.json", {
      fetchFn: async () =>
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    });
    expect(out.kind).toBe("openapi");
    expect(out.name).toBe("Petstore");
  });

  it("detects Google Discovery", async () => {
    const body = JSON.stringify({
      rootUrl: "https://www.googleapis.com/",
      resources: { pets: { methods: {} } },
    });
    const out = await detectSourceFromUrl("https://example.com/discovery.json", {
      fetchFn: async () => new Response(body, { status: 200 }),
    });
    expect(out.kind).toBe("discovery");
  });

  it("detects MCP from /mcp URL without body", async () => {
    const out = await detectSourceFromUrl("https://api.example.com/mcp", {
      fetchFn: async () => new Response("", { status: 200 }),
    });
    expect(out.kind).toBe("mcp");
  });

  it("detects GraphQL SDL", async () => {
    const body = "type Query { hello: String }";
    const out = await detectSourceFromUrl("https://example.com/schema.graphql", {
      fetchFn: async () => new Response(body, { status: 200 }),
    });
    expect(out.kind).toBe("graphql");
  });
});

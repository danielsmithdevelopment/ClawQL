import { describe, expect, it } from "vitest";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";
import type { OpenAPIDoc } from "./spec-loader.js";

describe("buildGraphQLSchema", () => {
  it("builds an executable schema from a minimal OpenAPI doc", async () => {
    const openapi: OpenAPIDoc = {
      openapi: "3.0.3",
      info: { title: "Tiny", version: "1" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { count: { type: "integer" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const { schema } = await buildGraphQLSchema(openapi, "https://api.example.com");
    const queryType = schema.getQueryType();
    expect(queryType).toBeTruthy();
    const fields = queryType!.getFields();
    expect(Object.keys(fields).length).toBeGreaterThan(0);
  });
});

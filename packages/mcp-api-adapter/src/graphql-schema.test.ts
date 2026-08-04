import { describe, expect, it } from "vitest";
import { graphql, printSchema } from "graphql";
import { toolArgsFromInputSchema, buildGraphqlSchemaFromCatalog } from "./graphql-schema.js";
import type { ToolCatalog } from "./types.js";
import type { CollapsedToolResult } from "./call.js";

describe("graphql-schema", () => {
  it("flattens simple object properties into args", () => {
    const { mode, args } = toolArgsFromInputSchema({
      type: "object",
      properties: {
        message: { type: "string" },
        shout: { type: "boolean" },
      },
      required: ["message"],
    });
    expect(mode).toBe("flat");
    expect(Object.keys(args).sort()).toEqual(["message", "shout"]);
  });

  it("builds executable schema with per-tool mutations", async () => {
    const catalog: ToolCatalog = {
      fetchedAt: new Date().toISOString(),
      grpcAddress: "127.0.0.1:50051",
      upstream: "127.0.0.1:50051",
      upstreamKind: "grpc",
      surfaces: ["openapi", "graphql", "mcp", "grpc"],
      tools: [
        {
          name: "echo",
          description: "Echo",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        },
      ],
    };

    const schema = buildGraphqlSchemaFromCatalog(catalog, {
      callTool: async () =>
        ({ structuredContent: { echo: "ok" } }) satisfies CollapsedToolResult,
      grpcAddress: catalog.grpcAddress,
      getCatalog: () => catalog,
    });
    const sdl = printSchema(schema);
    expect(sdl).toContain("type Mutation");
    expect(sdl).toContain("echo(message: String!): JSON");
    expect(sdl).toContain("callTool");

    const result = await graphql({
      schema,
      source: "{ health { status surfaces } tools { name } }",
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      health: { status: string; surfaces: string[] };
      tools: { name: string }[];
    };
    expect(data.health.status).toBe("ok");
    expect(data.health.surfaces).toContain("graphql");
    expect(data.tools.map((t) => t.name)).toEqual(["echo"]);
  });
});

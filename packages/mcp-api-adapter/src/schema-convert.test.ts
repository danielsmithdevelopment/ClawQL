import { describe, expect, it } from "vitest";
import {
  asObjectRequestSchema,
  isSafeToolPathName,
  jsonSchemaToOpenApiSchema,
} from "./schema-convert.js";

describe("schema-convert", () => {
  it("accepts safe tool path names", () => {
    expect(isSafeToolPathName("echo")).toBe(true);
    expect(isSafeToolPathName("memory_recall")).toBe(true);
    expect(isSafeToolPathName("../evil")).toBe(false);
    expect(isSafeToolPathName("a/b")).toBe(false);
  });

  it("rewrites $defs refs into components", () => {
    const components: Record<string, unknown> = {};
    const schema = jsonSchemaToOpenApiSchema(
      {
        type: "object",
        properties: {
          item: { $ref: "#/$defs/Item" },
        },
        $defs: {
          Item: { type: "object", properties: { id: { type: "string" } } },
        },
      },
      components,
      "tool_echo"
    );
    expect(components.tool_echo_Item).toBeTruthy();
    expect((schema.properties as Record<string, { $ref?: string }>).item?.$ref).toBe(
      "#/components/schemas/tool_echo_Item"
    );
  });

  it("wraps non-object roots", () => {
    const wrapped = asObjectRequestSchema({ type: "string" });
    expect(wrapped.type).toBe("object");
    expect((wrapped.properties as Record<string, unknown>).value).toEqual({ type: "string" });
  });
});

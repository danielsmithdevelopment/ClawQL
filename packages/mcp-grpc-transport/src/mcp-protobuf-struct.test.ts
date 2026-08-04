import { describe, expect, it } from "vitest";
import { jsonToStruct, structToJson, valueToJson } from "./mcp-protobuf-struct.js";

describe("structToJson", () => {
  it("decodes Struct.fields as a plain object", () => {
    expect(
      structToJson({
        fields: {
          query: { stringValue: "roadmap", kind: "stringValue" },
        },
      })
    ).toEqual({ query: "roadmap" });
  });

  it("decodes Struct.fields as a Map (Object.entries is empty for Map)", () => {
    const fields = new Map<string, unknown>([
      ["query", { stringValue: "roadmap", kind: "stringValue" }],
    ]);
    expect(structToJson({ fields })).toEqual({ query: "roadmap" });
  });
});

describe("valueToJson", () => {
  it("reads stringValue and string_value", () => {
    expect(valueToJson({ stringValue: "x" })).toBe("x");
    expect(valueToJson({ string_value: "y" })).toBe("y");
  });
});

describe("jsonToStruct", () => {
  it("round-trips nested JSON Schema through structToJson", () => {
    const schema = {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    };
    expect(structToJson(jsonToStruct(schema))).toEqual(schema);
  });
});

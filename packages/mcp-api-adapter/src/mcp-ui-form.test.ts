import { describe, expect, it } from "vitest";
import { parseFormArgs, renderToolFormFields } from "./mcp-ui-form.js";
import type { ListedMcpTool } from "mcp-grpc-transport";

describe("mcp-ui-form", () => {
  it("renders flat fields for simple schemas", () => {
    const tool: ListedMcpTool = {
      name: "echo",
      description: "Echo a message",
      inputSchema: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", description: "Text to echo" },
          loud: { type: "boolean", description: "Shout it" },
        },
      },
    };

    const { mode, html } = renderToolFormFields(tool);
    expect(mode).toBe("flat");
    expect(html).toContain('name="message"');
    expect(html).toContain('name="loud"');
    expect(html).toContain("Text to echo");
  });

  it("falls back to JSON textarea for complex schemas", () => {
    const tool: ListedMcpTool = {
      name: "run",
      inputSchema: {
        type: "object",
        properties: {
          payload: { type: "object", properties: { nested: { type: "string" } } },
        },
      },
    };

    const { mode, html } = renderToolFormFields(tool);
    expect(mode).toBe("jsonBag");
    expect(html).toContain('name="__json_args"');
  });

  it("parses flat form submissions into tool args", () => {
    const schema = {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        count: { type: "integer" },
        loud: { type: "boolean" },
      },
    };

    expect(
      parseFormArgs(
        { message: "hello", count: "3", loud: "true" },
        schema
      )
    ).toEqual({ message: "hello", count: 3, loud: true });

    expect(parseFormArgs({ message: "hello" }, schema)).toEqual({
      message: "hello",
      loud: false,
    });
  });

  it("parses JSON bag submissions", () => {
    expect(
      parseFormArgs({ __json_args: '{"a":1,"b":"two"}' }, { type: "object", properties: {} })
    ).toEqual({ a: 1, b: "two" });
  });
});

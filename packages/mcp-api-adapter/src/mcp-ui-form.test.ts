import { describe, expect, it } from "vitest";
import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  FormValidationError,
  fieldErrorFromMessage,
  parseFormArgs,
  renderToolFormFields,
} from "./mcp-ui-form.js";
import { formHintsForTool, resolveMcpUiTemplate } from "./mcp-ui-templates.js";
import { renderResultContent } from "./mcp-ui-results.js";

describe("mcp-ui-form", () => {
  it("renders required/optional badges and placeholders", () => {
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
    expect(html).toContain("badge--required");
    expect(html).toContain("badge--optional");
    expect(html).toContain('class="field-help">Text to echo</p>');
    expect(html).not.toMatch(/placeholder="Text to echo"/);
  });

  it("prefills schema defaults and blank optional enums", () => {
    const tool: ListedMcpTool = {
      name: "pick",
      inputSchema: {
        type: "object",
        required: ["mode"],
        properties: {
          mode: { type: "string", enum: ["a", "b"] },
          flavor: { type: "string", enum: ["x", "y"] },
          limit: { type: "integer", default: 5 },
        },
      },
    };

    const { html } = renderToolFormFields(tool);
    expect(html).toContain("— select —");
    expect(html).toContain('<option value=""');
    expect(html).toContain('value="5"');
  });

  it("puts non-primary fields into Advanced for templates", () => {
    const tool: ListedMcpTool = {
      name: "memory_recall",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          maxDepth: { type: "integer" },
          schema: { type: "string", enum: ["legal.Matter", "legal.Client"] },
          sources: { type: "array", items: { type: "string" } },
        },
      },
    };

    const { html } = renderToolFormFields(tool, formHintsForTool(tool));
    expect(html).toContain('name="query"');
    expect(html).toContain('name="limit"');
    expect(html).toContain("value=\"10\"");
    expect(html).toContain("<details class=\"advanced\"");
    expect(html).toContain('name="maxDepth"');
    expect(html).toContain('data-array="sources"');
    expect(html).toContain('name="sources[0]"');
    expect(html).not.toContain("Complex fields omitted: sources");
  });

  it("renders nested object fieldsets instead of JSON bag when possible", () => {
    const tool: ListedMcpTool = {
      name: "run",
      inputSchema: {
        type: "object",
        properties: {
          payload: {
            type: "object",
            properties: {
              nested: { type: "string" },
              count: { type: "integer" },
            },
            required: ["nested"],
          },
        },
      },
    };

    const { mode, html } = renderToolFormFields(tool);
    expect(mode).toBe("flat");
    expect(html).toContain('data-object="payload"');
    expect(html).toContain('name="payload.nested"');
    expect(html).toContain('name="payload.count"');
    expect(html).not.toContain('name="__json_args"');
  });

  it("falls back to JSON textarea when nothing structured is renderable", () => {
    const tool: ListedMcpTool = {
      name: "run",
      inputSchema: {
        type: "object",
        properties: {
          // deeply nested beyond MAX_NEST_DEPTH / no flat leaves at depth 0–2
          tree: {
            type: "object",
            properties: {
              branch: {
                type: "object",
                properties: {
                  leaf: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const { mode, html } = renderToolFormFields(tool);
    // depth 0 tree → depth 1 branch → depth 2 leaf (object) → depth 3 value is beyond
    // leaf object at depth 2 may still be "renderable" if it has flat children at depth 3?
    // isRenderableSchema(leaf, 2): leaf is object, checks children at depth 3 > MAX 2 → false for value
    // so leaf not renderable → branch has no renderable children → tree not → jsonBag
    expect(mode).toBe("jsonBag");
    expect(html).toContain('name="__json_args"');
  });

  it("parses flat form submissions and omits empty optionals", () => {
    const schema = {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        count: { type: "integer" },
        loud: { type: "boolean" },
        mode: { type: "string", enum: ["a", "b"] },
      },
    };

    expect(
      parseFormArgs({ message: "hello", count: "3", loud: "true", mode: "a" }, schema)
    ).toEqual({ message: "hello", count: 3, loud: true, mode: "a" });

    expect(parseFormArgs({ message: "hello", count: "", mode: "" }, schema)).toEqual({
      message: "hello",
    });
  });

  it("throws FormValidationError for missing required fields", () => {
    const schema = {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
    };
    expect(() => parseFormArgs({}, schema)).toThrow(FormValidationError);
  });

  it("parses JSON bag submissions", () => {
    expect(
      parseFormArgs({ __json_args: '{"a":1,"b":"two"}' }, { type: "object", properties: {} })
    ).toEqual({ a: 1, b: "two" });
  });

  it("parses nested object and array form keys", () => {
    const schema = {
      type: "object",
      required: ["payload"],
      properties: {
        payload: {
          type: "object",
          required: ["nested"],
          properties: {
            nested: { type: "string" },
            count: { type: "integer" },
          },
        },
        sources: { type: "array", items: { type: "string" } },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: { type: "string" },
              label: { type: "string" },
            },
          },
        },
      },
    };

    expect(
      parseFormArgs(
        {
          "payload.nested": "hello",
          "payload.count": "3",
          "sources[0]": "vault",
          "sources[1]": "vector",
          "sources[2]": "",
          "steps[0].tool": "search",
          "steps[0].label": "Find",
          "steps[1].tool": "",
        },
        schema
      )
    ).toEqual({
      payload: { nested: "hello", count: 3 },
      sources: ["vault", "vector"],
      steps: [{ tool: "search", label: "Find" }],
    });
  });

  it("extracts field names from MCP validation messages", () => {
    expect(
      fieldErrorFromMessage(
        "MCP error -32602: Input validation error: Invalid arguments for tool memory_recall: Invalid input: expected string, received undefined at query"
      ).field
    ).toBe("query");
  });
});

describe("mcp-ui-templates", () => {
  it("resolves templates for common ClawQL tools", () => {
    expect(resolveMcpUiTemplate({ name: "search", inputSchema: {} })?.id).toBe("search");
    expect(resolveMcpUiTemplate({ name: "cache", inputSchema: {} })?.resultKind).toBe("cache");
    expect(resolveMcpUiTemplate({ name: "upload_photo", inputSchema: {} })?.customHtml).toBe(
      "smart-upload"
    );
    expect(resolveMcpUiTemplate({ name: "unknown_tool", inputSchema: {} })).toBeUndefined();
  });
});

describe("mcp-ui-results", () => {
  it("renders search hits as a list", () => {
    const html = renderResultContent("search", {
      results: [
        {
          id: "repos/list",
          method: "GET",
          path: "/repos",
          description: "List repos",
          score: 12,
          specLabel: "github",
        },
      ],
    });
    expect(html).toContain("repos/list");
    expect(html).toContain("github");
    expect(html).toContain("Raw JSON");
  });

  it("renders memory recall hits", () => {
    const html = renderResultContent("memory", {
      ok: true,
      results: [{ path: "Memory/demo.md", score: 10, snippet: "Hello vault" }],
    });
    expect(html).toContain("Memory/demo.md");
    expect(html).toContain("Hello vault");
  });
});

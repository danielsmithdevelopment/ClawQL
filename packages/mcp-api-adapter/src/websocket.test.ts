import { describe, expect, it } from "vitest";
import { parseWsToolCall } from "./websocket.js";

describe("parseWsToolCall", () => {
  it("parses shorthand tool + arguments", () => {
    const r = parseWsToolCall({
      id: "1",
      tool: "memory_ingest",
      arguments: { title: "t", insights: "i" },
    });
    expect(r).toEqual({
      id: "1",
      toolName: "memory_ingest",
      args: { title: "t", insights: "i" },
    });
  });

  it("parses tools/call params shape", () => {
    const r = parseWsToolCall({
      id: 2,
      method: "tools/call",
      params: { name: "execute", arguments: { operationId: "cli__x__run" } },
    });
    expect(r).toEqual({
      id: 2,
      toolName: "execute",
      args: { operationId: "cli__x__run" },
    });
  });

  it("rejects missing tool name", () => {
    expect(parseWsToolCall({ id: "x", arguments: {} })).toEqual({
      error: "missing tool name (tool | name | params.name)",
    });
  });
});

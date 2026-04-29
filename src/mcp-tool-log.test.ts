import { afterEach, describe, expect, it, vi } from "vitest";
import { logMcpToolShape } from "./mcp-tool-log.js";

describe("mcp-tool-log", () => {
  const saved = process.env.CLAWQL_MCP_LOG_TOOLS;

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_MCP_LOG_TOOLS;
    else process.env.CLAWQL_MCP_LOG_TOOLS = saved;
    vi.restoreAllMocks();
  });

  it("does nothing when CLAWQL_MCP_LOG_TOOLS is not 1", () => {
    delete process.env.CLAWQL_MCP_LOG_TOOLS;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logMcpToolShape("memory_recall", { queryLen: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs JSON shape to stderr when CLAWQL_MCP_LOG_TOOLS=1", () => {
    process.env.CLAWQL_MCP_LOG_TOOLS = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logMcpToolShape("search", { termLen: 2, limit: 10 });
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[0])).toMatch(/tool search/);
    expect(String(spy.mock.calls[0]?.[0])).toContain("termLen");
  });
});

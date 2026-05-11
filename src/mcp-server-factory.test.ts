import { describe, expect, it } from "vitest";
import { CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES } from "./mcp-nonnegotiable-tools.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";

describe("createRegisteredMcpServer", () => {
  it("registers every non-negotiable MCP tool (cache + audit cannot be skipped)", () => {
    const server = createRegisteredMcpServer();
    const registry = (server as unknown as { _registeredTools: Record<string, { enabled?: boolean }> })
      ._registeredTools;
    for (const name of CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES) {
      expect(registry[name], `expected tool ${name}`).toBeDefined();
      expect(registry[name]?.enabled, `${name} must not be disabled`).not.toBe(false);
    }
  });
});

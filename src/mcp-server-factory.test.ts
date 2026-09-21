import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES } from "./mcp/mcp-nonnegotiable-tools.js";
import {
  createRegisteredMcpServer,
  createRegisteredMcpServerAsync,
} from "./mcp/mcp-server-factory.js";
import {
  ensureClawqlApi,
  resetClawqlApiForTests,
} from "./composition/clawql-api-adapters.js";

describe("createRegisteredMcpServer", () => {
  it("registers every non-negotiable MCP tool (cache + audit cannot be skipped)", () => {
    const server = createRegisteredMcpServer();
    const registry = (
      server as unknown as { _registeredTools: Record<string, { enabled?: boolean }> }
    )._registeredTools;
    for (const name of CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES) {
      expect(registry[name], `expected tool ${name}`).toBeDefined();
      expect(registry[name]?.enabled, `${name} must not be disabled`).not.toBe(false);
    }
  });
});

describe("ensureClawqlApi / createRegisteredMcpServerAsync", () => {
  beforeEach(() => {
    resetClawqlApiForTests();
  });

  afterEach(() => {
    resetClawqlApiForTests();
  });

  it("returns the same handle until reset, then rebuilds", async () => {
    const first = await ensureClawqlApi();
    const second = await ensureClawqlApi();
    expect(second).toBe(first);
    const names = first.listMcpTools().map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);

    resetClawqlApiForTests();
    const rebuilt = await ensureClawqlApi();
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.listMcpTools().map((t) => t.name).sort()).toEqual([...names].sort());
  });

  it("createRegisteredMcpServerAsync boots ensureClawqlApi then registers tools", async () => {
    const server = await createRegisteredMcpServerAsync();
    const registry = (
      server as unknown as { _registeredTools: Record<string, { enabled?: boolean }> }
    )._registeredTools;
    expect(registry.cache).toBeDefined();
    expect(registry.audit).toBeDefined();
  });
});

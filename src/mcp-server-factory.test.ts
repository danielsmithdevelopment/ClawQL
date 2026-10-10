import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES } from "./mcp/mcp-nonnegotiable-tools.js";
import {
  createRegisteredMcpServer,
  createRegisteredMcpServerAsync,
} from "./mcp/mcp-server-factory.js";
import { ensureClawqlApi, resetClawqlApiForTests } from "./composition/clawql-api-adapters.js";

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

  it("registers proxy_call only when plain proxy is enabled (ADR 0015)", () => {
    const savedEnable = process.env.CLAWQL_ENABLE_PLAIN_PROXY;
    const savedGroups = process.env.CLAWQL_PLAIN_PROXY_KEY_GROUPS;
    const savedGroup = process.env.CLAWQL_API_KEY_GROUP;
    try {
      delete process.env.CLAWQL_ENABLE_PLAIN_PROXY;
      delete process.env.CLAWQL_PLAIN_PROXY_KEY_GROUPS;
      delete process.env.CLAWQL_API_KEY_GROUP;
      const off = createRegisteredMcpServer({ name: "clawql-proxy-off", version: "0.0.0" });
      const offReg = (off as unknown as { _registeredTools: Record<string, { enabled?: boolean }> })
        ._registeredTools;
      expect(offReg.proxy_call).toBeUndefined();

      process.env.CLAWQL_ENABLE_PLAIN_PROXY = "1";
      const on = createRegisteredMcpServer({ name: "clawql-proxy-on", version: "0.0.0" });
      const onReg = (on as unknown as { _registeredTools: Record<string, { enabled?: boolean }> })
        ._registeredTools;
      expect(onReg.proxy_call).toBeDefined();
      expect(onReg.proxy_call?.enabled).not.toBe(false);
    } finally {
      if (savedEnable === undefined) delete process.env.CLAWQL_ENABLE_PLAIN_PROXY;
      else process.env.CLAWQL_ENABLE_PLAIN_PROXY = savedEnable;
      if (savedGroups === undefined) delete process.env.CLAWQL_PLAIN_PROXY_KEY_GROUPS;
      else process.env.CLAWQL_PLAIN_PROXY_KEY_GROUPS = savedGroups;
      if (savedGroup === undefined) delete process.env.CLAWQL_API_KEY_GROUP;
      else process.env.CLAWQL_API_KEY_GROUP = savedGroup;
    }
  });

  it("registers execute_program and submit_program_proposals only when programs are enabled (ADR 0015)", () => {
    const saved = process.env.CLAWQL_ENABLE_PROGRAMS;
    try {
      delete process.env.CLAWQL_ENABLE_PROGRAMS;
      const off = createRegisteredMcpServer({ name: "clawql-prog-off", version: "0.0.0" });
      const offReg = (off as unknown as { _registeredTools: Record<string, { enabled?: boolean }> })
        ._registeredTools;
      expect(offReg.execute_program).toBeUndefined();
      expect(offReg.submit_program_proposals).toBeUndefined();

      process.env.CLAWQL_ENABLE_PROGRAMS = "1";
      const on = createRegisteredMcpServer({ name: "clawql-prog-on", version: "0.0.0" });
      const onReg = (on as unknown as { _registeredTools: Record<string, { enabled?: boolean }> })
        ._registeredTools;
      expect(onReg.execute_program).toBeDefined();
      expect(onReg.execute_program?.enabled).not.toBe(false);
      expect(onReg.submit_program_proposals).toBeDefined();
      expect(onReg.submit_program_proposals?.enabled).not.toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_ENABLE_PROGRAMS;
      else process.env.CLAWQL_ENABLE_PROGRAMS = saved;
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
    expect(
      rebuilt
        .listMcpTools()
        .map((t) => t.name)
        .sort()
    ).toEqual([...names].sort());
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

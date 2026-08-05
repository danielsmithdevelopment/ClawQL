import { describe, expect, it } from "vitest";
import {
  createPanguardProxyPlugin,
  defaultPlugins,
  PANGUARD_PROXY_PLUGIN_ID,
  panguardInProcessEnabled,
  panguardProxyPluginEnabled,
} from "./panguard-proxy-plugin.js";

describe("createPanguardProxyPlugin", () => {
  it("returns mcp-proxy plugin with stable id", () => {
    const plugin = createPanguardProxyPlugin();
    expect(plugin.id).toBe(PANGUARD_PROXY_PLUGIN_ID);
    expect(plugin.kind).toBe("mcp-proxy");
    expect(plugin.vertical).toBe("security");
  });

  it("registers beforeCallTool when in-process", () => {
    const saved = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    const plugin = createPanguardProxyPlugin();
    expect(plugin.beforeCallTool).toBeDefined();
    if (saved === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    else process.env.CLAWQL_PANGUARD_IN_PROCESS = saved;
  });

  it("blocks memory_ingest when listed in CLAWQL_PANGUARD_BLOCK_TOOLS (B-4.3 spike)", async () => {
    const { Effect, Exit } = await import("effect");
    const savedIn = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    const savedBlock = process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = "memory_ingest";
    const plugin = createPanguardProxyPlugin();
    expect(plugin.beforeCallTool).toBeDefined();
    const blocked = await Effect.runPromiseExit(
      plugin.beforeCallTool!({ toolName: "memory_ingest", args: {} })
    );
    expect(Exit.isFailure(blocked)).toBe(true);
    const allowed = await Effect.runPromiseExit(
      plugin.beforeCallTool!({ toolName: "memory_recall", args: {} })
    );
    expect(Exit.isSuccess(allowed)).toBe(true);
    if (savedIn === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    else process.env.CLAWQL_PANGUARD_IN_PROCESS = savedIn;
    if (savedBlock === undefined) delete process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    else process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = savedBlock;
  });

  it("defaultPlugins includes Panguard unless disabled", () => {
    const saved = process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    expect(panguardProxyPluginEnabled()).toBe(true);
    expect(defaultPlugins()).toHaveLength(1);
    process.env.CLAWQL_PANGUARD_PROXY_PLUGIN = "0";
    expect(panguardProxyPluginEnabled()).toBe(false);
    expect(defaultPlugins()).toHaveLength(0);
    if (saved === undefined) delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    else process.env.CLAWQL_PANGUARD_PROXY_PLUGIN = saved;
  });

  it("panguardInProcessEnabled follows env", () => {
    const saved = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    expect(panguardInProcessEnabled()).toBe(false);
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    expect(panguardInProcessEnabled()).toBe(true);
    if (saved === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    else process.env.CLAWQL_PANGUARD_IN_PROCESS = saved;
  });
});

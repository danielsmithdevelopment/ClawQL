import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { WormAuditSink } from "clawql-core";
import {
  createPanguardProxyPlugin,
  defaultPlugins,
  PANGUARD_PROXY_PLUGIN_ID,
  panguardInProcessEnabled,
  panguardProxyPluginEnabled,
} from "./panguard-proxy-plugin.js";

const emptySession = { id: "t", atrScope: new Set<string>() };
const noopWorm = { append: () => Effect.void };

async function runPreExecute(
  plugin: ReturnType<typeof createPanguardProxyPlugin>,
  toolName: string
) {
  const hook = plugin.hooks![0]!;
  return Effect.runPromise(
    hook
      .handler({ session: emptySession, toolName, args: {} })
      .pipe(Effect.provideService(WormAuditSink, noopWorm))
  );
}

describe("createPanguardProxyPlugin", () => {
  it("returns ProviderPlugin with stable id", () => {
    const plugin = createPanguardProxyPlugin({ passive: true });
    expect(plugin.id).toBe(PANGUARD_PROXY_PLUGIN_ID);
    expect(plugin.description).toContain("Panguard");
    expect(plugin.hooks).toBeUndefined();
  });

  it("registers blocking pre-execute hook when in-process", () => {
    const saved = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    const plugin = createPanguardProxyPlugin();
    expect(plugin.hooks?.some((h) => h.event === "pre-execute" && h.blocking)).toBe(true);
    if (saved === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    else process.env.CLAWQL_PANGUARD_IN_PROCESS = saved;
  });

  it("blocks memory_ingest when listed in CLAWQL_PANGUARD_BLOCK_TOOLS", async () => {
    const savedIn = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    const savedBlock = process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = "memory_ingest";
    const plugin = createPanguardProxyPlugin();
    const blocked = await runPreExecute(plugin, "memory_ingest");
    expect(blocked.allow).toBe(false);
    const allowed = await runPreExecute(plugin, "memory_recall");
    expect(allowed.allow).toBe(true);
    if (savedIn === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    else process.env.CLAWQL_PANGUARD_IN_PROCESS = savedIn;
    if (savedBlock === undefined) delete process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    else process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = savedBlock;
  });

  it("defaultPlugins is empty unless CLAWQL_PANGUARD_PROXY_PLUGIN=1", () => {
    const saved = process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    expect(panguardProxyPluginEnabled()).toBe(false);
    expect(defaultPlugins()).toHaveLength(0);
    process.env.CLAWQL_PANGUARD_PROXY_PLUGIN = "1";
    expect(panguardProxyPluginEnabled()).toBe(true);
    expect(defaultPlugins()).toHaveLength(1);
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

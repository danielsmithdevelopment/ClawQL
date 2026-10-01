import { Effect } from "effect";
import { describe, expect, it, afterEach } from "vitest";
import { McpToolRegistry } from "clawql-api";
import { createInMemoryPluginHostServices, type ProviderPlugin } from "clawql-core";
import type { ClawQLPluginRegistrationApi } from "clawql-core";
import { createMemoryPlugin, MEMORY_PLUGIN_ID } from "./memory-plugin.js";

function installPluginMcpTools(plugin: ProviderPlugin, api: ClawQLPluginRegistrationApi) {
  const host = createInMemoryPluginHostServices();
  Effect.runSync(
    plugin.install({ registrationApi: api, pluginId: plugin.id }).pipe(Effect.provide(host.layer))
  );
}

describe("createMemoryPlugin", () => {
  const prevCodeGraph = process.env.CLAWQL_ENABLE_CODEGRAPH;
  const prevPageIndex = process.env.CLAWQL_ENABLE_PAGEINDEX;

  afterEach(() => {
    if (prevCodeGraph === undefined) delete process.env.CLAWQL_ENABLE_CODEGRAPH;
    else process.env.CLAWQL_ENABLE_CODEGRAPH = prevCodeGraph;
    if (prevPageIndex === undefined) delete process.env.CLAWQL_ENABLE_PAGEINDEX;
    else process.env.CLAWQL_ENABLE_PAGEINDEX = prevPageIndex;
  });

  it("registers memory_ingest, memory_recall, and read_around on install", () => {
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createMemoryPlugin();
    expect(plugin.id).toBe(MEMORY_PLUGIN_ID);
    installPluginMcpTools(plugin, api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall", "read_around"]);
  });

  it("never registers pageindex tools (purged in 8.0.0)", () => {
    // Legacy env must be a no-op after purge.
    process.env.CLAWQL_ENABLE_PAGEINDEX = "1";
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createMemoryPlugin(), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall", "read_around"]);
    expect(names.some((n) => n.startsWith("pageindex_"))).toBe(false);
  });

  it("never registers codegraph tools (purged in 8.0.0)", () => {
    // Legacy env must be a no-op after purge.
    process.env.CLAWQL_ENABLE_CODEGRAPH = "1";
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createMemoryPlugin(), api);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall", "read_around"]);
    expect(names.some((n) => n.startsWith("codegraph_"))).toBe(false);
  });
});

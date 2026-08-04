import { Effect } from "effect";
import { describe, expect, it, afterEach } from "vitest";
import { McpToolRegistry } from "clawql-api";
import { createMemoryPlugin, MEMORY_PLUGIN_ID } from "./memory-plugin.js";

describe("createMemoryPlugin", () => {
  const prevPageIndex = process.env.CLAWQL_ENABLE_PAGEINDEX;
  const prevCodeGraph = process.env.CLAWQL_ENABLE_CODEGRAPH;

  afterEach(() => {
    if (prevPageIndex === undefined) delete process.env.CLAWQL_ENABLE_PAGEINDEX;
    else process.env.CLAWQL_ENABLE_PAGEINDEX = prevPageIndex;
    if (prevCodeGraph === undefined) delete process.env.CLAWQL_ENABLE_CODEGRAPH;
    else process.env.CLAWQL_ENABLE_CODEGRAPH = prevCodeGraph;
  });

  it("registers memory_ingest and memory_recall on onRegister", () => {
    process.env.CLAWQL_ENABLE_PAGEINDEX = "0";
    process.env.CLAWQL_ENABLE_CODEGRAPH = "0";
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createMemoryPlugin();
    expect(plugin.id).toBe(MEMORY_PLUGIN_ID);
    expect(plugin.kind).toBe("default");
    Effect.runSync(plugin.onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall"]);
  });

  it("registers pageindex tools when CLAWQL_ENABLE_PAGEINDEX is not 0", () => {
    delete process.env.CLAWQL_ENABLE_PAGEINDEX;
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createMemoryPlugin().onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("pageindex_build_tree");
    expect(names).toContain("pageindex_traverse");
    expect(names).toContain("pageindex_synthesize");
    expect(names).toContain("pageindex_get_content");
  });

  it("omits pageindex tools when CLAWQL_ENABLE_PAGEINDEX=0", () => {
    process.env.CLAWQL_ENABLE_PAGEINDEX = "0";
    process.env.CLAWQL_ENABLE_CODEGRAPH = "0";
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createMemoryPlugin().onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall"]);
  });

  it("registers codegraph tools when CLAWQL_ENABLE_CODEGRAPH=1", () => {
    process.env.CLAWQL_ENABLE_PAGEINDEX = "0";
    process.env.CLAWQL_ENABLE_CODEGRAPH = "1";
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createMemoryPlugin().onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("codegraph_index");
    expect(names).toContain("codegraph_query");
    expect(names).toContain("codegraph_neighbors");
    expect(names).toContain("codegraph_path");
    expect(names).toContain("codegraph_explain");
    expect(names).toContain("codegraph_subgraph");
    expect(names).toContain("codegraph_import_graphify");
    expect(names).toContain("codegraph_sync");
    expect(names).toContain("codegraph_sync_graphify");
  });

  it("omits codegraph tools when CLAWQL_ENABLE_CODEGRAPH is unset", () => {
    process.env.CLAWQL_ENABLE_PAGEINDEX = "0";
    delete process.env.CLAWQL_ENABLE_CODEGRAPH;
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createMemoryPlugin().onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall"]);
  });
});

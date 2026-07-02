import { createClawQLApi } from "clawql-api";
import { describe, expect, it } from "vitest";
import { makeMemoryLayer } from "./memory-layer.js";
import { MEMORY_PLUGIN_ID } from "./memory-plugin.js";

describe("makeMemoryLayer", () => {
  it("registers MemoryPlugin when composed via pluginLayers", () => {
    const api = createClawQLApi({
      plugins: [],
      pluginLayers: [makeMemoryLayer()],
    });
    expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(true);
    const names = api.listMcpTools().map((t) => t.name);
    expect(names).toContain("memory_ingest");
    expect(names).toContain("memory_recall");
  });
});

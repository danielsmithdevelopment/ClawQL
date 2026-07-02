import { describe, expect, it } from "vitest";
import { createClawQLApi } from "../create-api.js";
import { makeMemoryLayer } from "./memory-layer.js";
import { MEMORY_PLUGIN_ID } from "./memory-plugin.js";

describe("makeMemoryLayer", () => {
  it("registers MemoryPlugin when composed via pluginLayers", () => {
    const saved = process.env.CLAWQL_ENABLE_MEMORY;
    process.env.CLAWQL_ENABLE_MEMORY = "1";
    try {
      const api = createClawQLApi({
        plugins: [],
        pluginLayers: [makeMemoryLayer()],
      });
      expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(true);
      const names = api.listMcpTools().map((t) => t.name);
      expect(names).toContain("memory_ingest");
      expect(names).toContain("memory_recall");
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_ENABLE_MEMORY;
      else process.env.CLAWQL_ENABLE_MEMORY = saved;
    }
  });
});

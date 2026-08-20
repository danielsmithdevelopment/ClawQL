import { McpToolRegistry } from "clawql-api";
import { createClawQLApi } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { DATA_PLUGIN_ID, createDataPlugin, makeDataLayer } from "./index.js";

describe("createDataPlugin", () => {
  it("registers data_query, data_ingest, and data_status", () => {
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createDataPlugin();
    expect(plugin.id).toBe(DATA_PLUGIN_ID);
    Effect.runSync(plugin.onRegister!(api));
    expect(registry.list().map((t) => t.name).sort()).toEqual([
      "data_ingest",
      "data_query",
      "data_status",
    ]);
  });
});

describe("makeDataLayer", () => {
  it("registers DataPlugin when composed via pluginLayers", () => {
    const api = createClawQLApi({
      plugins: [],
      pluginLayers: [makeDataLayer()],
    });
    expect(api.registry.list().some((p) => p.id === DATA_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().map((t) => t.name)).toContain("data_query");
  });
});

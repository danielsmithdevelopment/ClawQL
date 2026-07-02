import { createClawQLApi, ExecuteService, SearchService } from "clawql-api";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { getOuroborosPluginDeps } from "./deps.js";
import { OUROBOROS_PLUGIN_ID } from "./ouroboros-plugin.js";
import { makeOuroborosLayer } from "./ouroboros-layer.js";

describe("makeOuroborosLayer", () => {
  it("registers OuroborosPlugin and wires search/execute deps", async () => {
    const searchLayer = Layer.succeed(SearchService, {
      search: () => Effect.succeed({ formattedText: "[]" }),
    });
    const executeLayer = Layer.succeed(ExecuteService, {
      execute: () => Effect.succeed({ content: [{ type: "text" as const, text: "{}" }] }),
    });
    const api = createClawQLApi({
      plugins: [],
      searchLayer,
      executeLayer,
      pluginLayers: [makeOuroborosLayer()],
    });
    expect(api.registry.list().some((p) => p.id === OUROBOROS_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().map((t) => t.name)).toContain("ouroboros_create_seed_from_document");
    const deps = getOuroborosPluginDeps();
    const searchResult = await deps.search({ query: "probe", limit: 5 });
    expect(searchResult.content[0]?.text).toBe("[]");
  });
});

import { createClawQLApi, ExecuteService } from "clawql-api";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { getDocumentsPluginDeps } from "./deps.js";
import { DOCUMENTS_PLUGIN_ID } from "./documents-plugin.js";
import { makeDocumentsLayer } from "./documents-layer.js";

describe("makeDocumentsLayer", () => {
  it("registers DocumentsPlugin and wires execute deps", async () => {
    const executeLayer = Layer.succeed(ExecuteService, {
      execute: () => Effect.succeed({ content: [{ type: "text" as const, text: "{}" }] }),
    });
    const api = createClawQLApi({
      plugins: [],
      executeLayer,
      pluginLayers: [makeDocumentsLayer()],
    });
    expect(api.registry.list().some((p) => p.id === DOCUMENTS_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().map((t) => t.name)).toContain("ingest_external_knowledge");
    const deps = getDocumentsPluginDeps();
    const result = await deps.execute({ operationId: "probe", args: {} });
    expect(result.content[0]?.text).toBe("{}");
  });
});

import { createClawQLApi, ExecuteService } from "clawql-api";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { AUTOMATION_PLUGIN_ID } from "./automation-plugin.js";
import { makeAutomationLayer } from "./automation-layer.js";

describe("makeAutomationLayer", () => {
  it("registers AutomationPlugin when notify is enabled", () => {
    const executeLayer = Layer.succeed(ExecuteService, {
      execute: () => Effect.succeed({ content: [{ type: "text" as const, text: "{}" }] }),
    });
    const api = createClawQLApi({
      plugins: [],
      executeLayer,
      pluginLayers: [makeAutomationLayer({ enableNotify: true })],
    });
    expect(api.registry.list().some((p) => p.id === AUTOMATION_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().map((t) => t.name)).toContain("notify");
  });
});

import { describe, expect, it } from "vitest";
import { defineProviderPlugin } from "clawql-core";
import { createClawQLApi } from "./create-api.js";
import { modelHooksFromClawqlApi, synthesizeScenariosFromApi } from "./host-hooks.js";

describe("host-hooks", () => {
  it("modelHooksFromClawqlApi exposes hookRegistry + worm", () => {
    const api = createClawQLApi({ plugins: [] });
    const hooks = modelHooksFromClawqlApi(api, ["a"]);
    expect(hooks.hookRegistry).toBe(api.hookRegistry);
    expect(hooks.worm).toBe(api.worm);
    expect(hooks.atrScopeTokens).toEqual(["a"]);
  });

  it("synthesizeScenariosFromApi uses registered tools + parameterNotes", async () => {
    process.env.CLAWQL_ALLOW_NO_ENFORCEMENT = "1";
    const plugin = defineProviderPlugin({
      id: "synth-demo",
      version: "1.0.0",
      description: "demo",
      tools: [
        {
          name: "synth_ping",
          description: "Ping",
          schema: {
            type: "object",
            properties: { message: { type: "string" } },
          },
          parameterNotes: { message: 'Use "hello"' },
          handler: async () => ({ content: [{ type: "text", text: "pong" }] }),
        },
      ],
    });
    const api = createClawQLApi({ plugins: [plugin] });
    const scenarios = await synthesizeScenariosFromApi(api, {
      pluginId: "synth-demo",
      gradedComplexity: ["simple"],
    });
    expect(scenarios.length).toBe(1);
    expect(scenarios[0]?.expectedToolSequence[0]?.args.message).toBe("hello");
    await api.dispose();
  });
});

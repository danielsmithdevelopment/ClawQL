import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { configureOuroborosPluginDeps } from "./deps.js";
import { OUROBOROS_PLUGIN_ID, createOuroborosPlugin } from "./ouroboros-plugin.js";

describe("createOuroborosPlugin", () => {
  it("registers ouroboros_* tools", () => {
    configureOuroborosPluginDeps({
      search: vi.fn(async () => ({ content: [{ type: "text", text: "[]" }] })),
      execute: vi.fn(async () => ({ content: [{ type: "text", text: "{}" }] })),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createOuroborosPlugin();
    expect(plugin.id).toBe(OUROBOROS_PLUGIN_ID);
    Effect.runSync(plugin.onRegister!(api));
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual([
      "ouroboros_create_seed_from_document",
      "ouroboros_get_lineage_status",
      "ouroboros_measure_drift",
      "ouroboros_run_evolutionary_loop",
    ]);
    Effect.runSync(plugin.onTeardown!());
  });
});

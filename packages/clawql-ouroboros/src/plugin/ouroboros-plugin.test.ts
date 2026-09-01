import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryPluginHostServices,
  type ClawQLPluginRegistrationApi,
  type ProviderPlugin,
} from "clawql-core";
import { configureOuroborosPluginDeps } from "./deps.js";
import { OUROBOROS_PLUGIN_ID, createOuroborosPlugin } from "./ouroboros-plugin.js";

function installPluginMcpTools(plugin: ProviderPlugin, api: ClawQLPluginRegistrationApi) {
  const host = createInMemoryPluginHostServices();
  Effect.runSync(
    plugin.install({ registrationApi: api, pluginId: plugin.id }).pipe(Effect.provide(host.layer))
  );
}

function uninstallPlugin(plugin: ProviderPlugin, api: ClawQLPluginRegistrationApi) {
  const host = createInMemoryPluginHostServices();
  Effect.runSync(
    plugin.uninstall({ registrationApi: api, pluginId: plugin.id }).pipe(Effect.provide(host.layer))
  );
}

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
    installPluginMcpTools(plugin, api);
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
    uninstallPlugin(plugin, api);
  });
});

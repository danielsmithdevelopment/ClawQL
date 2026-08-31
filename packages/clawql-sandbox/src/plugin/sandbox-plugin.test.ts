import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createInMemoryPluginHostServices,
  type ClawQLPluginRegistrationApi,
  type ProviderPlugin,
} from "clawql-core";
import { createSandboxPlugin, SANDBOX_PLUGIN_ID } from "./sandbox-plugin.js";

function installPluginMcpTools(plugin: ProviderPlugin, api: ClawQLPluginRegistrationApi) {
  const host = createInMemoryPluginHostServices();
  Effect.runSync(
    plugin.install({ registrationApi: api, pluginId: plugin.id }).pipe(Effect.provide(host.layer))
  );
}

describe("createSandboxPlugin", () => {
  it("registers sandbox_exec", () => {
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createSandboxPlugin();
    expect(plugin.id).toBe(SANDBOX_PLUGIN_ID);
    installPluginMcpTools(plugin, api);
    expect(registry.list().map((t) => t.name)).toEqual(["sandbox_exec"]);
  });
});

import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createInMemoryPluginHostServices,
  type ClawQLPluginRegistrationApi,
  type ProviderPlugin,
} from "clawql-core";
import { configureAutomationPluginDeps } from "./deps.js";
import { AUTOMATION_PLUGIN_ID, createAutomationPlugin } from "./automation-plugin.js";

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

describe("createAutomationPlugin", () => {
  it("registers schedule and starts worker when enableSchedule", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createAutomationPlugin({ enableSchedule: true });
    expect(plugin.id).toBe(AUTOMATION_PLUGIN_ID);
    installPluginMcpTools(plugin, api);
    expect(registry.list().map((t) => t.name)).toEqual(["schedule"]);
    uninstallPlugin(plugin, api);
  });

  it("registers notify when enableNotify", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createAutomationPlugin({ enableNotify: true }), api);
    expect(registry.list().map((t) => t.name)).toEqual(["notify"]);
  });

  it("registers workflow when enableWorkflow", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createAutomationPlugin({ enableWorkflow: true }), api);
    expect(registry.list().map((t) => t.name)).toEqual(["workflow"]);
  });

  it("registers argocd when enableArgoCd", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createAutomationPlugin({ enableArgoCd: true }), api);
    expect(registry.list().map((t) => t.name)).toEqual(["argocd"]);
  });

  it("registers hitl_enqueue_label_studio when enableHitlLabelStudio", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    installPluginMcpTools(createAutomationPlugin({ enableHitlLabelStudio: true }), api);
    expect(registry.list().map((t) => t.name)).toEqual(["hitl_enqueue_label_studio"]);
  });
});

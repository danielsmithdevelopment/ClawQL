import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { configureAutomationPluginDeps } from "./deps.js";
import { AUTOMATION_PLUGIN_ID, createAutomationPlugin } from "./automation-plugin.js";

describe("createAutomationPlugin", () => {
  it("registers schedule and starts worker when enableSchedule", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createAutomationPlugin({ enableSchedule: true });
    expect(plugin.id).toBe(AUTOMATION_PLUGIN_ID);
    Effect.runSync(plugin.onRegister!(api));
    expect(registry.list().map((t) => t.name)).toEqual(["schedule"]);
    Effect.runSync(plugin.onTeardown!());
  });

  it("registers notify when enableNotify", () => {
    configureAutomationPluginDeps({
      execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    Effect.runSync(createAutomationPlugin({ enableNotify: true }).onRegister!(api));
    expect(registry.list().map((t) => t.name)).toEqual(["notify"]);
  });
});

import { McpToolRegistry } from "clawql-api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createSandboxPlugin, SANDBOX_PLUGIN_ID } from "./sandbox-plugin.js";

describe("createSandboxPlugin", () => {
  it("registers sandbox_exec", () => {
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createSandboxPlugin();
    expect(plugin.id).toBe(SANDBOX_PLUGIN_ID);
    Effect.runSync(plugin.onRegister!(api));
    expect(registry.list().map((t) => t.name)).toEqual(["sandbox_exec"]);
  });
});

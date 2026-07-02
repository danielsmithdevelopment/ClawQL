import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { McpToolRegistry } from "clawql-api";
import { createMemoryPlugin, MEMORY_PLUGIN_ID } from "./memory-plugin.js";

describe("createMemoryPlugin", () => {
  it("registers memory_ingest and memory_recall on onRegister", () => {
    const registry = new McpToolRegistry();
    const api = registry.registrationApi();
    const plugin = createMemoryPlugin();
    expect(plugin.id).toBe(MEMORY_PLUGIN_ID);
    expect(plugin.kind).toBe("default");
    Effect.runSync(plugin.onRegister!(api));
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(["memory_ingest", "memory_recall"]);
  });
});

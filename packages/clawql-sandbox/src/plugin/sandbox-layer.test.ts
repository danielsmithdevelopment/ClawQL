import { createClawQLApi } from "clawql-api";
import { describe, expect, it } from "vitest";
import { SANDBOX_PLUGIN_ID } from "./sandbox-plugin.js";
import { makeSandboxLayer } from "./sandbox-layer.js";

describe("makeSandboxLayer", () => {
  it("registers SandboxPlugin when composed via pluginLayers", () => {
    const api = createClawQLApi({
      plugins: [],
      pluginLayers: [makeSandboxLayer()],
    });
    expect(api.registry.list().some((p) => p.id === SANDBOX_PLUGIN_ID)).toBe(true);
    expect(api.listMcpTools().map((t) => t.name)).toContain("sandbox_exec");
  });
});

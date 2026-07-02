import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeMemoryLayer, MEMORY_PLUGIN_ID } from "clawql-memory/plugin";
import { ClawQLApi, createClawQLApi } from "./index.js";
import { PANGUARD_PROXY_PLUGIN_ID } from "./plugins/panguard-proxy-plugin.js";

describe("createClawQLApi", () => {
  it("registers Panguard proxy plugin by default", () => {
    const api = createClawQLApi({ plugins: [] });
    const withDefaults = createClawQLApi();
    expect(withDefaults.registry.list().some((p) => p.id === PANGUARD_PROXY_PLUGIN_ID)).toBe(true);
    expect(api.registry.list()).toHaveLength(0);
  });

  it("does not register MemoryPlugin via default sync plugins", () => {
    const saved = process.env.CLAWQL_ENABLE_MEMORY;
    process.env.CLAWQL_ENABLE_MEMORY = "1";
    try {
      const api = createClawQLApi();
      expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_ENABLE_MEMORY;
      else process.env.CLAWQL_ENABLE_MEMORY = saved;
    }
  });

  it("registers plugins via ClawQLApi service", async () => {
    const api = createClawQLApi({ plugins: [] });
    await api.run(
      Effect.gen(function* () {
        const claw = yield* ClawQLApi;
        yield* claw.registerPlugin({ id: "demo", version: "0.0.1" });
        const plugins = claw.listPlugins();
        expect(plugins).toHaveLength(1);
        expect(plugins[0]?.id).toBe("demo");
      })
    );
  });

  it("rejects duplicate plugin ids", async () => {
    const api = createClawQLApi({ plugins: [] });
    await expect(
      api.run(
        Effect.gen(function* () {
          const claw = yield* ClawQLApi;
          yield* claw.registerPlugin({ id: "dup", version: "1" });
          yield* claw.registerPlugin({ id: "dup", version: "2" });
        })
      )
    ).rejects.toThrow();
  });

  it("registers plugins from pluginLayers at runtime init", () => {
    const api = createClawQLApi({
      plugins: [],
      pluginLayers: [makeMemoryLayer()],
    });
    expect(api.registry.list().some((p) => p.id === MEMORY_PLUGIN_ID)).toBe(true);
    const names = api.listMcpTools().map((t) => t.name);
    expect(names).toContain("memory_ingest");
    expect(names).toContain("memory_recall");
  });
});

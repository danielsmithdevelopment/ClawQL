import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { MEMORY_PLUGIN_ID } from "clawql-memory/plugin";
import { ClawQLApi, createClawQLApi } from "./index.js";
import { PANGUARD_PROXY_PLUGIN_ID } from "./plugins/panguard-proxy-plugin.js";

describe("createClawQLApi", () => {
  it("does not register Panguard by default (8.0+ opt-in)", () => {
    const prev = process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    try {
      const withDefaults = createClawQLApi();
      expect(withDefaults.registry.list().some((p) => p.id === PANGUARD_PROXY_PLUGIN_ID)).toBe(
        false
      );
      process.env.CLAWQL_PANGUARD_PROXY_PLUGIN = "1";
      const optedIn = createClawQLApi();
      expect(optedIn.registry.list().some((p) => p.id === PANGUARD_PROXY_PLUGIN_ID)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
      else process.env.CLAWQL_PANGUARD_PROXY_PLUGIN = prev;
    }
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

  it("dispose tears down plugins and ManagedRuntime", async () => {
    const api = createClawQLApi({ plugins: [] });
    await api.run(
      Effect.gen(function* () {
        const claw = yield* ClawQLApi;
        yield* claw.registerPlugin({ id: "demo-dispose", version: "0.0.1" });
      })
    );
    expect(api.registry.list().some((p) => p.id === "demo-dispose")).toBe(true);
    await api.dispose();
    expect(api.registry.list()).toHaveLength(0);
  });

  it("pluginLayers register synchronously and keep Scope until dispose", async () => {
    const finalizerRan = Ref.unsafeMake(false);
    const pluginLayer = Layer.scopedDiscard(
      Effect.gen(function* () {
        const claw = yield* ClawQLApi;
        yield* claw.registerPlugin({ id: "from-plugin-layer", version: "0.0.1" });
        yield* Effect.addFinalizer(() => Ref.set(finalizerRan, true));
      })
    );
    const api = createClawQLApi({
      plugins: [],
      pluginLayers: [pluginLayer],
    });
    expect(api.registry.list().some((p) => p.id === "from-plugin-layer")).toBe(true);
    expect(Effect.runSync(Ref.get(finalizerRan))).toBe(false);
    await api.dispose();
    expect(Effect.runSync(Ref.get(finalizerRan))).toBe(true);
  });
});

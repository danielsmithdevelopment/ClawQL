import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  SessionCatalogService,
  WormAuditSink,
  createSharedCapabilityCatalogLayer,
} from "clawql-core";
import { Layer } from "effect";
import {
  buildHarnessContext,
  defaultCapabilityRegisterWiring,
  registerHarnessPlugins,
  makeHarnessWormLayer,
  type HarnessRegistryState,
} from "./index.js";
import type { HarnessPlugin, HarnessTool } from "./types.js";

const noopTool = (name: string): HarnessTool => ({
  name,
  description: name,
  handler: () => Effect.succeed({ ok: true }),
});

describe("§3.5.1 capability register intercept wiring", () => {
  it("blocks novel tools from going live when intercept enabled and catalog empty", async () => {
    const wormLayer = makeHarnessWormLayer();
    const state = await Effect.runPromise(
      registerHarnessPlugins({
        plugins: [
          {
            id: "probe",
            version: "0.0.1",
            setup: (ctx) =>
              Effect.sync(() => {
                ctx.tools.register(noopTool("novel.hot.plugin"));
              }),
          } satisfies HarnessPlugin,
        ],
        model: { provider: "stub", name: "t" },
        sessionId: "reg-s1",
        enableCapabilityRegisterIntercept: true,
      }).pipe(Effect.provide(wormLayer))
    );

    expect(state.tools.has("novel.hot.plugin")).toBe(false);
    expect(state.blockedRegistrations.has("novel.hot.plugin")).toBe(true);
    expect(state.blockedRegistrations.get("novel.hot.plugin")?.disposition).toBe(
      "routed_to_sandbox"
    );
  });

  it("accepts tools in session_catalog ∩ S when intercept enabled", async () => {
    const catalogLayer = createSharedCapabilityCatalogLayer();
    const wormSink = Layer.succeed(WormAuditSink, {
      append: () => Effect.void,
    });
    const shared = Layer.mergeAll(catalogLayer, wormSink);

    await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "reg-s2",
          tools: new Set(["search"]),
          atrScope: new Set(["search"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
      }).pipe(Effect.provide(shared))
    );

    const wormLayer = makeHarnessWormLayer();
    const state = await Effect.runPromise(
      registerHarnessPlugins({
        plugins: [
          {
            id: "probe",
            version: "0.0.1",
            setup: (ctx) =>
              Effect.sync(() => {
                ctx.tools.register(noopTool("search"));
                ctx.tools.register(noopTool("novel.other"));
              }),
          } satisfies HarnessPlugin,
        ],
        model: { provider: "stub", name: "t" },
        sessionId: "reg-s2",
        enableCapabilityRegisterIntercept: true,
        capabilityRegisterWiring: {
          harnessId: "clawql-harness",
          layer: shared,
        },
      }).pipe(Effect.provide(wormLayer))
    );

    expect(state.tools.has("search")).toBe(true);
    expect(state.tools.has("novel.other")).toBe(false);
    expect(state.blockedRegistrations.has("novel.other")).toBe(true);
  });

  it("does not intercept when disabled (default)", async () => {
    const wormLayer = makeHarnessWormLayer();
    const state = await Effect.runPromise(
      registerHarnessPlugins({
        plugins: [
          {
            id: "probe",
            version: "0.0.1",
            setup: (ctx) =>
              Effect.sync(() => {
                ctx.tools.register(noopTool("anything.goes"));
              }),
          } satisfies HarnessPlugin,
        ],
        model: { provider: "stub", name: "t" },
        enableCapabilityRegisterIntercept: false,
      }).pipe(Effect.provide(wormLayer))
    );
    expect(state.tools.has("anything.goes")).toBe(true);
    expect(state.blockedRegistrations.size).toBe(0);
  });

  it("defaultCapabilityRegisterWiring exposes clawql-harness id", () => {
    const w = defaultCapabilityRegisterWiring();
    expect(w.harnessId).toBe("clawql-harness");
  });

  it("buildHarnessContext without wiring still registers", () => {
    const state: HarnessRegistryState = {
      plugins: [],
      tools: new Map(),
      blockedRegistrations: new Map(),
      loopHandlers: { plan: [], act: [], observe: [], evaluate: [] },
      sessionId: "x",
      model: { provider: "stub", name: "t" },
      scope: { toolsInScope: ["a"], toolsOutOfScope: [] },
      started: true,
    };
    const ctx = buildHarnessContext(state);
    ctx.tools.register(noopTool("a"));
    expect(state.tools.has("a")).toBe(true);
  });
});

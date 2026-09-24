import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  SessionCatalogService,
  WormAuditSink,
} from "clawql-core";
import { getCapabilityLifecycleRuntime, resetCapabilityLifecycleRuntimeForTests } from "clawql-api";
import {
  buildHarnessContext,
  defaultCapabilityRegisterWiring,
  isolatedCapabilityRegisterWiring,
  registerHarnessPlugins,
  makeHarnessWormLayer,
  reportHarnessToolRegistration,
  type HarnessRegistryState,
} from "./index.js";
import type { HarnessPlugin, HarnessTool } from "./types.js";
import { OuroborosPlugin } from "../plugins/ouroboros/index.js";

const noopTool = (name: string): HarnessTool => ({
  name,
  description: name,
  handler: () => Effect.succeed({ ok: true }),
});

describe("§3.5.1 capability register intercept wiring", () => {
  it("blocks novel tools when intercept enabled and catalog has no match", async () => {
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
        capabilityRegisterWiring: isolatedCapabilityRegisterWiring(),
        atrScope: {
          toolsInScope: ["search"],
          toolsOutOfScope: [],
        },
      }).pipe(Effect.provide(wormLayer))
    );

    expect(state.tools.has("novel.hot.plugin")).toBe(false);
    expect(state.blockedRegistrations.has("novel.hot.plugin")).toBe(true);
    expect(state.blockedRegistrations.get("novel.hot.plugin")?.disposition).toBe(
      "routed_to_sandbox"
    );
    // in-scope seed allows search
    expect(state.tools.size).toBe(0);
  });

  it("accepts tools seeded from atrScope.toolsInScope", async () => {
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
        sessionId: "reg-seed",
        enableCapabilityRegisterIntercept: true,
        capabilityRegisterWiring: isolatedCapabilityRegisterWiring(),
        atrScope: {
          toolsInScope: ["search"],
          toolsOutOfScope: [],
        },
      }).pipe(Effect.provide(wormLayer))
    );

    expect(state.tools.has("search")).toBe(true);
    expect(state.tools.has("novel.other")).toBe(false);
  });

  it("shares catalog with clawql-api getCapabilityLifecycleRuntime()", async () => {
    resetCapabilityLifecycleRuntimeForTests();
    const runtime = getCapabilityLifecycleRuntime();
    const wormSink = Layer.succeed(WormAuditSink, { append: () => Effect.void });
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "shared-s",
          tools: new Set(["search"]),
          atrScope: new Set(["search"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
      }).pipe(Effect.provide(Layer.mergeAll(runtime.catalogLayer, wormSink)))
    );

    const wiring = defaultCapabilityRegisterWiring();
    const result = reportHarnessToolRegistration({
      wiring,
      sessionId: "shared-s",
      tool: noopTool("search"),
    });
    expect(result.accepted).toBe(true);
  });

  it("does not intercept when CLAWQL_CAPABILITY_LIFECYCLE=1 alone (MCP gate only)", async () => {
    const prev = process.env.CLAWQL_CAPABILITY_LIFECYCLE;
    const prevH = process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
    process.env.CLAWQL_CAPABILITY_LIFECYCLE = "1";
    delete process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
    try {
      const wormLayer = makeHarnessWormLayer();
      const state = await Effect.runPromise(
        registerHarnessPlugins({
          plugins: [OuroborosPlugin],
          model: { provider: "stub", name: "t" },
          sessionId: "life-mcp-only",
        }).pipe(Effect.provide(wormLayer))
      );
      expect(state.tools.has("clawql_think")).toBe(true);
      expect(state.blockedRegistrations.size).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
      else process.env.CLAWQL_CAPABILITY_LIFECYCLE = prev;
      if (prevH === undefined) delete process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER;
      else process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER = prevH;
    }
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

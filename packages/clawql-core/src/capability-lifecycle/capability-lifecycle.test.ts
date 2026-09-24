/**
 * Unified Capability Lifecycle v0.2 — five-step test steps 1–4 (invoke side).
 * Step 5 (register-side) is intentionally not asserted as implemented.
 */

import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { atrScopeFromTokens, fireHook, type HookContext } from "../plugin/index.js";
import { makeCapturingWormLayer } from "../plugin/worm-sink.js";
import {
  CapabilityLifecycleCatalogStackLive,
  CapabilityRegisterIntercept,
  createCapabilityReachabilityHook,
  createSharedCapabilityCatalogLayer,
  decideExecuteReachability,
  evaluateExecuteReachability,
  PromotionStore,
  recordSlowPathCompletedNoNewCapability,
  SessionCatalogService,
  validatedScopeSubsetOfS,
} from "./index.js";

function stack(capture = makeCapturingWormLayer()) {
  return {
    layer: Layer.mergeAll(CapabilityLifecycleCatalogStackLive, capture.layer),
    capture,
  };
}

describe("decideExecuteReachability (pure)", () => {
  it("allows bucket 1 session catalog ∩ S", () => {
    const d = decideExecuteReachability({
      toolName: "fs.read",
      sessionId: "s1",
      catalogTools: new Set(["fs.read", "fs.list"]),
      atrScope: new Set(["fs.read", "fs.list"]),
    });
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.bucket).toBe("session_catalog");
  });

  it("denies tool not in catalog even if atrScope contains it", () => {
    const d = decideExecuteReachability({
      toolName: "hot.plugin",
      sessionId: "s1",
      catalogTools: new Set(["fs.read"]),
      atrScope: new Set(["fs.read", "hot.plugin"]),
    });
    expect(d.allow).toBe(false);
  });

  it("allows bucket 3 promoted skill when skillId matches and validatedScope ⊆ S", () => {
    const d = decideExecuteReachability({
      toolName: "skill.extract",
      sessionId: "s1",
      catalogTools: new Set(["fs.read"]),
      atrScope: new Set(["fs.read", "skill.extract"]),
      promoted: {
        skillId: "skill.extract",
        validatedScope: ["skill.extract"],
      },
    });
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.bucket).toBe("gated_skill");
  });

  it("denies invoking a validatedScope token that is not the skillId (no scope backdoor)", () => {
    const d = decideExecuteReachability({
      toolName: "fs.write",
      sessionId: "s1",
      catalogTools: new Set(["fs.read"]),
      atrScope: new Set(["fs.read", "fs.write", "skill.extract"]),
      promoted: {
        skillId: "skill.extract",
        validatedScope: ["fs.read", "fs.write"],
      },
    });
    expect(d.allow).toBe(false);
  });

  it("denies promotion whose validatedScope is not ⊆ S (cannot widen S)", () => {
    const d = decideExecuteReachability({
      toolName: "skill.wide",
      sessionId: "s1",
      catalogTools: new Set(["fs.read"]),
      atrScope: new Set(["fs.read"]),
      promoted: {
        skillId: "skill.wide",
        validatedScope: ["skill.wide", "admin.danger"],
      },
    });
    expect(d.allow).toBe(false);
    expect(validatedScopeSubsetOfS(["skill.wide", "admin.danger"], new Set(["fs.read"]))).toBe(
      false
    );
  });
});

describe("five-step test — steps 1–4 (invoke side)", () => {
  it("step 1: ordinary session-catalog operations succeed", async () => {
    const { layer } = stack();
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["fs.read", "fs.list"]),
          tools: new Set(["fs.read", "fs.list"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* evaluateExecuteReachability({
          sessionId: "sess-1",
          toolName: "fs.read",
        });
      }).pipe(Effect.provide(layer))
    );
    expect(decision.allow).toBe(true);
  });

  it("steps 2–3: hot-loaded tool invoke is DENIED with CAPABILITY_WRITE_INTERCEPTED", async () => {
    const { layer, capture } = stack();
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["fs.read"]),
          tools: new Set(["fs.read"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* evaluateExecuteReachability({
          sessionId: "sess-1",
          toolName: "opencode2.hot.plugin",
          interceptKind: "invoke",
        });
      }).pipe(Effect.provide(layer))
    );

    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.disposition).toBe("denied");
      expect(decision.interceptKind).toBe("invoke");
    }
    const events = await Effect.runPromise(capture.events());
    const intercepted = events.find((e) => e.type === "CAPABILITY_WRITE_INTERCEPTED");
    expect(intercepted).toBeDefined();
    if (intercepted && intercepted.type === "CAPABILITY_WRITE_INTERCEPTED") {
      expect(intercepted.interceptKind).toBe("invoke");
      expect(intercepted.disposition).toBe("denied");
    }
  });

  it("step 4a: promotion accept refuses validatedScope that widens S", async () => {
    const { layer } = stack();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        const promotions = yield* PromotionStore;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["fs.read"]),
          tools: new Set(["fs.read"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* promotions
          .accept(
            {
              skillId: "skill.sneaky",
              validatedScope: ["fs.read", "admin.widen"],
              acceptedAt: new Date().toISOString(),
            },
            "sess-1"
          )
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer))
    );
    expect(result._tag).toBe("Left");
  });

  it("step 4b: register disposition is clawql-core routed_to_sandbox (not harness claim)", async () => {
    const { layer, capture } = stack();
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        const reg = yield* CapabilityRegisterIntercept;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["fs.read"]),
          tools: new Set(["fs.read"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* reg.reportRegistration({
          sessionId: "sess-1",
          toolName: "novel.code",
          harnessId: "opencode2",
          mechanism: "unspecified",
        });
      }).pipe(Effect.provide(layer))
    );
    const events = await Effect.runPromise(capture.events());
    const e = events.find((x) => x.type === "CAPABILITY_WRITE_INTERCEPTED");
    expect(e && e.type === "CAPABILITY_WRITE_INTERCEPTED" && e.disposition).toBe(
      "routed_to_sandbox"
    );
  });

  it("step 5: register-side is NOT claimed implemented by default", async () => {
    const { layer } = stack();
    const implemented = await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* CapabilityRegisterIntercept;
        return yield* reg.isRegisterSideImplemented();
      }).pipe(Effect.provide(layer))
    );
    expect(implemented).toBe(false);
  });

  it("step 5 honesty: marking harness A does not claim harness B implemented", async () => {
    const { layer } = stack();
    const [a, b] = await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* CapabilityRegisterIntercept;
        yield* reg.markImplemented("harness-a");
        const forA = yield* reg.isRegisterSideImplemented("harness-a");
        const forB = yield* reg.isRegisterSideImplemented("harness-b");
        const outcome = yield* reg.reportRegistration({
          sessionId: "sess-x",
          toolName: "t",
          harnessId: "harness-b",
          mechanism: "unspecified",
        });
        return [forA, forB && outcome.registerSideImplemented] as const;
      }).pipe(Effect.provide(layer))
    );
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});

describe("session catalog rebind (§3.5.2)", () => {
  it("allows rebind within prior S and records WORM", async () => {
    const { layer, capture } = stack();
    const catalog = await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["a", "b"]),
          tools: new Set(["a"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* catalogs.rebind({
          sessionId: "sess-1",
          newTools: ["a", "b"],
          authorizedBy: "operator@clawql.com",
        });
      }).pipe(Effect.provide(layer))
    );
    expect(catalog.rebindGeneration).toBe(1);
    expect(catalog.tools.has("b")).toBe(true);
    const events = await Effect.runPromise(capture.events());
    expect(events.some((e) => e.type === "SESSION_CATALOG_REBOUND")).toBe(true);
  });

  it("rejects silent widen without explicitWiderScopeGrant", async () => {
    const { layer } = stack();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "sess-1",
          atrScope: new Set(["a"]),
          tools: new Set(["a"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
        return yield* catalogs
          .rebind({
            sessionId: "sess-1",
            newTools: ["a"],
            newAtrScope: ["a", "extra"],
            authorizedBy: "operator",
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer))
    );
    expect(result._tag).toBe("Left");
  });
});

describe("slow path WORM + hook enforcement", () => {
  it("records SLOW_PATH_COMPLETED_NO_NEW_CAPABILITY", async () => {
    const { layer, capture } = stack();
    await Effect.runPromise(
      recordSlowPathCompletedNoNewCapability("sess-1").pipe(Effect.provide(layer))
    );
    const events = await Effect.runPromise(capture.events());
    expect(events.some((e) => e.type === "SLOW_PATH_COMPLETED_NO_NEW_CAPABILITY")).toBe(true);
  });

  it("blocking hook denies hot tool via fireHook with shared catalog layer", async () => {
    const capture = makeCapturingWormLayer();
    const catalogLayer = createSharedCapabilityCatalogLayer();
    const hook = {
      ...createCapabilityReachabilityHook({ catalogLayer }),
      pluginId: "capability-lifecycle",
    };
    const full = Layer.mergeAll(catalogLayer, capture.layer);

    // Separate runPromise calls must share state (process-stable Layer.succeed)
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        yield* catalogs.bind({
          sessionId: "mcp",
          atrScope: new Set(["fs.read"]),
          tools: new Set(["fs.read"]),
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
      }).pipe(Effect.provide(full))
    );

    const ctx: HookContext = {
      session: { id: "mcp", atrScope: atrScopeFromTokens(["fs.read"]) },
      toolName: "hot.tool",
      args: {},
    };

    const denied = await Effect.runPromise(fireHook(hook, ctx).pipe(Effect.provide(full)));
    expect(denied.allow).toBe(false);
    expect(denied.denyReason).toMatch(/CAPABILITY_WRITE_INTERCEPTED/);

    const allowed = await Effect.runPromise(
      fireHook(hook, {
        session: { id: "mcp", atrScope: atrScopeFromTokens(["fs.read"]) },
        toolName: "fs.read",
        args: {},
      }).pipe(Effect.provide(full))
    );
    expect(allowed.allow).toBe(true);
  });

  it("lazy bootstrap unions process-registered MCP tools into default seed", async () => {
    const {
      clearProcessRegisteredCapabilityToolsForTests,
      ensureSessionCatalogBound,
      noteProcessRegisteredCapabilityTools,
      resolveCapabilitySessionSeed,
    } = await import("./catalog-bootstrap.js");
    clearProcessRegisteredCapabilityToolsForTests();
    noteProcessRegisteredCapabilityTools(["notify", "knowledge_search_onyx", "schedule"]);
    const seed = await Effect.runPromise(resolveCapabilitySessionSeed(null));
    expect(seed).toContain("notify");
    expect(seed).toContain("search");
    const { layer } = stack();
    const catalog = await Effect.runPromise(
      ensureSessionCatalogBound({ sessionId: "seed-union" }).pipe(Effect.provide(layer))
    );
    expect(catalog.tools.has("notify")).toBe(true);
    expect(catalog.tools.has("knowledge_search_onyx")).toBe(true);
    clearProcessRegisteredCapabilityToolsForTests();
  });
});

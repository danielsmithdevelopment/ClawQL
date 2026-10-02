/**
 * McpProxyPipeline integration: three-bucket gate with lazy catalog bootstrap.
 */

import { Effect } from "effect";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PluginRegistry } from "../plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "../proxy/mcp-proxy-pipeline.js";
import {
  createCapabilityLifecyclePlugin,
  capabilityLifecyclePluginEnabled,
  resetCapabilityLifecycleRuntimeForTests,
} from "./capability-lifecycle-plugin.js";

describe("capability lifecycle MCP wiring", () => {
  beforeEach(() => {
    resetCapabilityLifecycleRuntimeForTests();
  });

  afterEach(() => {
    delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
    delete process.env.CLAWQL_CAPABILITY_SESSION_SEED;
  });

  it("defaults to enabled unless CLAWQL_CAPABILITY_LIFECYCLE=0", () => {
    delete process.env.CLAWQL_CAPABILITY_LIFECYCLE;
    expect(capabilityLifecyclePluginEnabled()).toBe(true);
    process.env.CLAWQL_CAPABILITY_LIFECYCLE = "0";
    expect(capabilityLifecyclePluginEnabled()).toBe(false);
    process.env.CLAWQL_CAPABILITY_LIFECYCLE = "1";
    expect(capabilityLifecyclePluginEnabled()).toBe(true);
  });

  it("denies hot tool via McpProxyPipeline after catalog bind", async () => {
    const registry = new PluginRegistry();
    const handle = createCapabilityLifecyclePlugin();
    const layer = mcpProxyPipelineLayer(registry);

    await Effect.runPromise(
      handle.bindSessionCatalog({
        sessionId: "s1",
        atrScope: new Set(["fs.read"]),
        tools: new Set(["fs.read"]),
        boundAt: new Date().toISOString(),
        rebindGeneration: 0,
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register(handle.plugin, { registerMcpTool: () => Effect.void });
      })
    );

    const denyExit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "hot.plugin",
          args: {},
          sessionId: "s1",
          atrScopeTokens: ["fs.read"],
        });
      }).pipe(Effect.provide(layer))
    );
    expect(denyExit._tag).toBe("Failure");

    await Effect.runPromise(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "fs.read",
          args: {},
          sessionId: "s1",
          atrScopeTokens: ["fs.read"],
        });
      }).pipe(Effect.provide(layer))
    );
  });

  it("auto-binds from atrScopeTokens and allows in-scope tools", async () => {
    const registry = new PluginRegistry();
    const handle = createCapabilityLifecyclePlugin();
    const layer = mcpProxyPipelineLayer(registry);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register(handle.plugin, { registerMcpTool: () => Effect.void });
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "search",
          args: {},
          sessionId: "auto-bind-1",
          atrScopeTokens: ["search", "execute"],
        });
      }).pipe(Effect.provide(layer))
    );

    const deny = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "notify",
          args: {},
          sessionId: "auto-bind-1",
          atrScopeTokens: ["search", "execute"],
        });
      }).pipe(Effect.provide(layer))
    );
    expect(deny._tag).toBe("Failure");
  });

  it("fail-closes tools outside default seed when ATR tokens absent", async () => {
    const registry = new PluginRegistry();
    const handle = createCapabilityLifecyclePlugin();
    const layer = mcpProxyPipelineLayer(registry);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register(handle.plugin, { registerMcpTool: () => Effect.void });
      })
    );

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "fs.read",
          args: {},
          sessionId: "unbound-outside-seed",
        });
      }).pipe(Effect.provide(layer))
    );
    expect(exit._tag).toBe("Failure");
  });
});

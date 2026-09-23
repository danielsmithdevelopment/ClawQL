/**
 * McpProxyPipeline integration: three-bucket gate must deny hot tools when
 * CLAWQL_CAPABILITY_LIFECYCLE wiring is installed on the shared HookRegistry.
 */

import { Effect } from "effect";
import { describe, expect, it, beforeEach } from "vitest";
import { PluginRegistry } from "../plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "../proxy/mcp-proxy-pipeline.js";
import {
  createCapabilityLifecyclePlugin,
  resetCapabilityLifecycleRuntimeForTests,
} from "./capability-lifecycle-plugin.js";

describe("capability lifecycle MCP wiring", () => {
  beforeEach(() => {
    resetCapabilityLifecycleRuntimeForTests();
  });

  it("denies hot tool via McpProxyPipeline after catalog bind", async () => {
    const registry = new PluginRegistry();
    const handle = createCapabilityLifecyclePlugin();
    const layer = mcpProxyPipelineLayer(registry);

    await Effect.runPromise(handle.bindSessionCatalog({
      sessionId: "s1",
      atrScope: new Set(["fs.read"]),
      tools: new Set(["fs.read"]),
      boundAt: new Date().toISOString(),
      rebindGeneration: 0,
    }));

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

  it("fail-closes when session catalog was never bound", async () => {
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
          sessionId: "unbound",
        });
      }).pipe(Effect.provide(layer))
    );
    expect(exit._tag).toBe("Failure");
  });
});

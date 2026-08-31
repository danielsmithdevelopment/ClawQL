import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  atrScopeFromTokens,
  defineProviderPlugin,
  type HookContext,
  type HookResult,
} from "clawql-core";
import { PluginRegistry } from "../plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "./mcp-proxy-pipeline.js";

describe("McpProxyPipeline", () => {
  it("runs ProviderPlugin pre-execute hooks via fireHook", async () => {
    const registry = new PluginRegistry();
    const layer = mcpProxyPipelineLayer(registry);
    const calls: string[] = [];

    const plugin = defineProviderPlugin({
      id: "test-proxy",
      version: "0.0.1",
      description: "test",
      hooks: [
        {
          id: "test-proxy:pre-execute",
          scope: "tool",
          event: "pre-execute",
          toolPattern: ".*",
          blocking: true,
          handler: (ctx: HookContext) =>
            Effect.sync(() => {
              calls.push(ctx.toolName ?? "");
              const ok: HookResult = { allow: true };
              return ok;
            }),
        },
      ],
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register(plugin, { registerMcpTool: () => Effect.void });
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({ toolName: "search", args: {} });
      }).pipe(Effect.provide(layer))
    );
    expect(calls).toEqual(["search"]);
  });

  it("denies when a blocking pre-execute hook returns allow:false", async () => {
    const registry = new PluginRegistry();
    const plugin = defineProviderPlugin({
      id: "deny-plugin",
      version: "0.0.1",
      description: "deny",
      hooks: [
        {
          id: "deny-search",
          scope: "tool",
          event: "pre-execute",
          toolPattern: "search",
          blocking: true,
          handler: () =>
            Effect.succeed({
              allow: false,
              denyReason: "blocked by test hook",
            } satisfies HookResult),
        },
      ],
    });

    const layer = mcpProxyPipelineLayer(registry);
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        yield* registry.register(plugin, { registerMcpTool: () => Effect.void });
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "search",
          args: {},
          atrScopeTokens: [],
          sessionId: "s1",
        });
      }).pipe(Effect.provide(layer))
    );
    expect(exit._tag).toBe("Failure");
  });

  it("passes session ATR into fireHook", async () => {
    const registry = new PluginRegistry();
    let sawSize = -1;
    const plugin = defineProviderPlugin({
      id: "atr-plugin",
      version: "0.0.1",
      description: "atr",
      hooks: [
        {
          id: "atr-check",
          scope: "tool",
          event: "pre-execute",
          toolPattern: ".*",
          blocking: true,
          handler: (ctx) =>
            Effect.sync(() => {
              sawSize = ctx.session.atrScope.size;
              return { allow: true } satisfies HookResult;
            }),
        },
      ],
    });
    const layer = mcpProxyPipelineLayer(registry);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register(plugin, { registerMcpTool: () => Effect.void });
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({
          toolName: "cache",
          args: {},
          atrScopeTokens: ["a", "b"],
        });
      }).pipe(Effect.provide(layer))
    );
    expect(sawSize).toBe(atrScopeFromTokens(["a", "b"]).size);
  });
});

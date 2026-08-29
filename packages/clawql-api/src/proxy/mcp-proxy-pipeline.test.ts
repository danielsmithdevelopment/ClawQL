import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { RegisteredHook, WormAuditEvent } from "clawql-core";
import { PluginRegistry } from "../plugin-registry.js";
import { McpProxyPipeline, mcpProxyPipelineLayer } from "./mcp-proxy-pipeline.js";

describe("McpProxyPipeline", () => {
  it("chains beforeCallTool hooks from mcp-proxy plugins", async () => {
    const registry = new PluginRegistry();
    const layer = mcpProxyPipelineLayer(registry);
    const calls: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* registry.register({
          id: "test-proxy",
          version: "0.0.1",
          kind: "mcp-proxy",
          beforeCallTool: ({ toolName }) =>
            Effect.sync(() => {
              calls.push(toolName);
            }),
        });
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({ toolName: "search", args: {} });
      }).pipe(Effect.provide(layer))
    );
    expect(calls).toEqual(["search"]);
  });

  it("runs HookRegistry pre-execute via fireHook before legacy proxies", async () => {
    const registry = new PluginRegistry();
    const audit: WormAuditEvent[] = [];
    const hooks: RegisteredHook[] = [
      {
        id: "deny-search",
        pluginId: "test",
        scope: "tool",
        event: "pre-execute",
        toolPattern: "search",
        blocking: true,
        handler: () => Effect.succeed({ allow: false, denyReason: "blocked by test hook" }),
      },
    ];

    const layer = mcpProxyPipelineLayer({
      registry,
      hookRegistry: {
        list: (event, toolName) =>
          Effect.succeed(
            hooks.filter(
              (h) =>
                h.event === event && (!toolName || new RegExp(h.toolPattern ?? ".*").test(toolName))
            )
          ),
      },
      worm: {
        append: (event) =>
          Effect.sync(() => {
            audit.push(event);
          }),
      },
    });

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const pipeline = yield* McpProxyPipeline;
        yield* pipeline.runBeforeCallTool({ toolName: "search", args: {} });
      }).pipe(Effect.provide(layer))
    );
    expect(exit._tag).toBe("Failure");
    expect(audit.some((e) => e.type === "HOOK_TRIGGERED")).toBe(true);
  });
});

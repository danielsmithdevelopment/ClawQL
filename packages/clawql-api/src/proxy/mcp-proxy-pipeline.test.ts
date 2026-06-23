import { Effect } from "effect";
import { describe, expect, it } from "vitest";
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
});

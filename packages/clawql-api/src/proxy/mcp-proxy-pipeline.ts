import type { ClawQLError } from "clawql-core";
import { Context, Effect, Layer } from "effect";
import type { PluginRegistry } from "../plugin-registry.js";

export type McpProxyCallContext = {
  readonly toolName: string;
  readonly args: unknown;
};

/** Chains `beforeCallTool` hooks from registered `mcp-proxy` plugins (Phase 2). */
export class McpProxyPipeline extends Context.Tag("clawql/McpProxyPipeline")<
  McpProxyPipeline,
  {
    readonly runBeforeCallTool: (
      ctx: McpProxyCallContext
    ) => Effect.Effect<void, ClawQLError | Error>;
  }
>() {}

export function mcpProxyPipelineLayer(registry: PluginRegistry): Layer.Layer<McpProxyPipeline> {
  return Layer.succeed(
    McpProxyPipeline,
    McpProxyPipeline.of({
      runBeforeCallTool: (ctx) =>
        Effect.gen(function* () {
          for (const plugin of registry.list()) {
            if (plugin.kind !== "mcp-proxy" || !plugin.beforeCallTool) continue;
            yield* plugin.beforeCallTool(ctx);
          }
        }),
    })
  );
}

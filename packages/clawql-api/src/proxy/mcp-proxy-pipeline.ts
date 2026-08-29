/**
 * McpProxyPipeline — Phase-2 beforeCallTool + optional 8.0 fireHook pre-execute path.
 */

import {
  atrScopeFromTokens,
  fireHooksForEvent,
  ClawQLError,
  isSecurityError,
  WormAuditSink,
  type RegisteredHook,
} from "clawql-core";
import { Context, Effect, Layer } from "effect";
import type { PluginRegistry } from "../plugin-registry.js";

export type McpProxyCallContext = {
  readonly toolName: string;
  readonly args: unknown;
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
};

export type McpProxyPipelineOptions = {
  readonly registry: PluginRegistry;
  /**
   * When set with `worm`, runs HookRegistry `pre-execute` hooks through `fireHook`
   * (ATR never-loosen) before legacy `beforeCallTool` plugins.
   */
  readonly hookRegistry?: {
    readonly list: (
      event: "pre-execute",
      toolName?: string
    ) => Effect.Effect<readonly RegisteredHook[], never>;
  };
  readonly worm?: Context.Tag.Service<typeof WormAuditSink>;
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

function isPluginRegistry(
  value: PluginRegistry | McpProxyPipelineOptions
): value is PluginRegistry {
  return typeof (value as PluginRegistry).list === "function" && !("registry" in (value as object));
}

export function mcpProxyPipelineLayer(
  registryOrOptions: PluginRegistry | McpProxyPipelineOptions
): Layer.Layer<McpProxyPipeline> {
  const options: McpProxyPipelineOptions = isPluginRegistry(registryOrOptions)
    ? { registry: registryOrOptions }
    : registryOrOptions;

  const { registry, hookRegistry, worm } = options;

  return Layer.succeed(
    McpProxyPipeline,
    McpProxyPipeline.of({
      runBeforeCallTool: (ctx) =>
        Effect.gen(function* () {
          if (hookRegistry && worm) {
            const listed = yield* hookRegistry.list("pre-execute", ctx.toolName);
            if (listed.length > 0) {
              const result = yield* fireHooksForEvent(
                listed,
                {
                  session: {
                    id: ctx.sessionId ?? "mcp",
                    atrScope: atrScopeFromTokens(ctx.atrScopeTokens ?? []),
                  },
                  toolName: ctx.toolName,
                  args: ctx.args,
                },
                { stopOnDeny: true }
              ).pipe(
                Effect.provideService(WormAuditSink, worm),
                Effect.mapError((e) =>
                  isSecurityError(e)
                    ? new ClawQLError({ reason: e.reason })
                    : e
                )
              );

              if (!result.allow) {
                return yield* Effect.fail(
                  new ClawQLError({
                    reason: result.denyReason ?? `Hook denied tool: ${ctx.toolName}`,
                  })
                );
              }
            }
          }

          for (const plugin of registry.list()) {
            if (plugin.kind !== "mcp-proxy" || !plugin.beforeCallTool) continue;
            yield* plugin.beforeCallTool(ctx);
          }
        }),
    })
  );
}

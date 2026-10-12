/**
 * McpProxyPipeline — 8.0 fireHook pre-execute only (no legacy beforeCallTool).
 */

import {
  atrScopeFromTokens,
  fireHooksForEvent,
  ClawQLError,
  isSecurityError,
  WormAuditSink,
} from "clawql-core";
import { Context, Effect, Layer } from "effect";
import type { PluginRegistry } from "../plugin-registry.js";

export type McpProxyCallContext = {
  readonly toolName: string;
  readonly args: unknown;
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
};

/** Runs HookRegistry `pre-execute` hooks through `fireHook` (ATR never-loosen). */
export class McpProxyPipeline extends Context.Service<
  McpProxyPipeline,
  {
    readonly runBeforeCallTool: (
      ctx: McpProxyCallContext
    ) => Effect.Effect<void, ClawQLError | Error>;
  }
>()("clawql/McpProxyPipeline") {}

export function mcpProxyPipelineLayer(registry: PluginRegistry): Layer.Layer<McpProxyPipeline> {
  /**
   * Tools with a confirmed empty `pre-execute` list (common under equal-arm /
   * Core-only benches). Cleared when plugins register new hooks is rare after boot;
   * wrong sticky empty would skip enforcement — only cache length-0 results.
   */
  const emptyPreExecuteTools = new Set<string>();

  return Layer.succeed(
    McpProxyPipeline,
    McpProxyPipeline.of({
      runBeforeCallTool: (ctx) =>
        Effect.gen(function* () {
          if (emptyPreExecuteTools.has(ctx.toolName)) return;

          const listed = yield* registry.hookRegistry.list("pre-execute", ctx.toolName);
          if (listed.length === 0) {
            emptyPreExecuteTools.add(ctx.toolName);
            return;
          }

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
            Effect.provideService(WormAuditSink, registry.worm),
            Effect.mapError((e) => (isSecurityError(e) ? new ClawQLError({ reason: e.reason }) : e))
          );

          if (!result.allow) {
            return yield* Effect.fail(
              new ClawQLError({
                reason: result.denyReason ?? `Hook denied tool: ${ctx.toolName}`,
              })
            );
          }
        }),
    })
  );
}

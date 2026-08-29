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
export class McpProxyPipeline extends Context.Tag("clawql/McpProxyPipeline")<
  McpProxyPipeline,
  {
    readonly runBeforeCallTool: (
      ctx: McpProxyCallContext
    ) => Effect.Effect<void, ClawQLError | Error>;
  }
>() {}

export function mcpProxyPipelineLayer(
  registry: PluginRegistry
): Layer.Layer<McpProxyPipeline> {
  return Layer.succeed(
    McpProxyPipeline,
    McpProxyPipeline.of({
      runBeforeCallTool: (ctx) =>
        Effect.gen(function* () {
          const listed = yield* registry.hookRegistry.list("pre-execute", ctx.toolName);
          if (listed.length === 0) return;

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
            Effect.mapError((e) =>
              isSecurityError(e) ? new ClawQLError({ reason: e.reason }) : e
            )
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

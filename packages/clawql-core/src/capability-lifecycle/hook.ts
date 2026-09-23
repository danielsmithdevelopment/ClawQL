/**
 * Blocking pre-execute hook enforcing three-bucket reachability (§3.5).
 * Factory accepts a Layer for SessionCatalog + PromotionStore so the
 * LifecycleHook handler R stays WormAuditSink-compatible.
 */

import { Effect, type Layer } from "effect";
import type {
  HookContext,
  HookResult,
  LifecycleHook,
  WormAuditSink,
} from "../plugin/provider-types.js";
import { evaluateExecuteReachability } from "./execute-reachability.js";
import type { SessionCatalogService } from "./session-catalog.js";
import type { PromotionStore } from "./promotion-store.js";

export type CapabilityCatalogServices = SessionCatalogService | PromotionStore;

export type CapabilityReachabilityHookOptions = {
  readonly hookId?: string;
  readonly resolveSessionId?: (ctx: HookContext) => string;
  readonly resolveTargetTool?: (ctx: HookContext) => string | undefined;
  /** Layer providing SessionCatalogService + PromotionStore (not WormAuditSink). */
  readonly catalogLayer: Layer.Layer<CapabilityCatalogServices, never, never>;
};

function defaultTargetTool(ctx: HookContext): string | undefined {
  if (ctx.toolName && ctx.toolName !== "execute") return ctx.toolName;
  const args = ctx.args as Record<string, unknown> | undefined;
  if (!args) return ctx.toolName;
  const inner =
    (typeof args.operationId === "string" && args.operationId) ||
    (typeof args.tool === "string" && args.tool) ||
    (typeof args.name === "string" && args.name) ||
    (typeof args.toolName === "string" && args.toolName);
  return inner || ctx.toolName;
}

export function createCapabilityReachabilityHook(
  options: CapabilityReachabilityHookOptions
): LifecycleHook {
  const resolveSessionId = options.resolveSessionId ?? ((ctx) => ctx.session.id);
  const resolveTarget = options.resolveTargetTool ?? defaultTargetTool;

  return {
    id: options.hookId ?? "capability-lifecycle-three-bucket",
    scope: "tool",
    event: "pre-execute",
    toolPattern: ".*",
    blocking: true,
    handler: (ctx: HookContext): Effect.Effect<HookResult, Error, WormAuditSink> =>
      Effect.gen(function* () {
        const toolName = resolveTarget(ctx);
        if (!toolName) {
          return { allow: true } satisfies HookResult;
        }
        const sessionId = resolveSessionId(ctx);
        const decision = yield* evaluateExecuteReachability({
          sessionId,
          toolName,
          interceptKind: "invoke",
        }).pipe(Effect.provide(options.catalogLayer));

        if (decision.allow) {
          return {
            allow: true,
            meta: { capabilityBucket: decision.bucket },
          } satisfies HookResult;
        }
        return {
          allow: false,
          denyReason: `CAPABILITY_WRITE_INTERCEPTED: ${decision.reason}`,
          meta: {
            interceptKind: decision.interceptKind,
            disposition: decision.disposition,
          },
        } satisfies HookResult;
      }),
  };
}

/**
 * clawql-core hook firing mechanism — ATR never-loosen invariant lives HERE, not in any provider.
 * @see docs/design/clawql-core-plugin-architecture.md §5.2
 */

import { Effect } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import {
  type AtrScope,
  type HookContext,
  type HookResult,
  type LifecycleHook,
  type RegisteredHook,
  SecurityError,
  WormAuditSink,
} from "./provider-types.js";

export function atrScopeFromTokens(tokens: readonly string[]): AtrScope {
  return new Set(tokens);
}

export function atrScopeTokens(scope: AtrScope): readonly string[] {
  return [...scope];
}

/** True if every grant token is already present in the session ATR. */
export function grantsWithinAtr(
  atrScope: AtrScope,
  attemptedGrant: readonly string[] | undefined
): boolean {
  if (!attemptedGrant || attemptedGrant.length === 0) return true;
  for (const token of attemptedGrant) {
    if (!atrScope.has(token)) return false;
  }
  return true;
}

function summarizeForAudit(result: HookResult): string {
  const parts = [`allow=${result.allow}`];
  if (result.denyReason) parts.push(`deny=${result.denyReason}`);
  if (result.attemptedGrant?.length) parts.push(`grant=${result.attemptedGrant.join(",")}`);
  return parts.join(";");
}

/**
 * Fire one lifecycle hook. Requires WormAuditSink in context.
 * Rejects any attemptedGrant outside session ATR with HOOK_SCOPE_VIOLATION_BLOCKED.
 */
export function fireHook(
  hook: LifecycleHook & { readonly pluginId: string },
  ctx: HookContext
): Effect.Effect<HookResult, ClawQLError | SecurityError | Error, WormAuditSink> {
  return Effect.gen(function* () {
    const worm = yield* WormAuditSink;
    const result = yield* hook.handler(ctx);

    if (!grantsWithinAtr(ctx.session.atrScope, result.attemptedGrant)) {
      const attempted = result.attemptedGrant ?? [];
      yield* worm.append({
        type: "HOOK_SCOPE_VIOLATION_BLOCKED",
        hookId: hook.id,
        pluginId: hook.pluginId,
        sessionId: ctx.session.id,
        attemptedGrant: attempted,
        declaredScope: atrScopeTokens(ctx.session.atrScope),
        timestamp: new Date().toISOString(),
      });
      return yield* Effect.fail(
        new SecurityError(`Hook ${hook.id} attempted to grant scope beyond session ATR — rejected`)
      );
    }

    yield* worm.append({
      type: "HOOK_TRIGGERED",
      hookId: hook.id,
      pluginId: hook.pluginId,
      scope: hook.scope,
      event: hook.event,
      sessionId: ctx.session.id,
      resultSummary: summarizeForAudit(result),
      timestamp: new Date().toISOString(),
    });

    return result;
  });
}

/**
 * Fire all matching hooks for an event (blocking hooks awaited in registration order).
 * First `allow: false` short-circuits when `stopOnDeny` is true (default).
 */
export function fireHooksForEvent(
  hooks: readonly RegisteredHook[],
  ctx: HookContext,
  options: { readonly stopOnDeny?: boolean } = {}
): Effect.Effect<HookResult, ClawQLError | SecurityError | Error, WormAuditSink> {
  const stopOnDeny = options.stopOnDeny !== false;
  return Effect.gen(function* () {
    let last: HookResult = { allow: true };
    for (const hook of hooks) {
      if (!hook.blocking) {
        // Non-blocking: still fire for audit, but do not gate on result.
        yield* fireHook(hook, ctx).pipe(Effect.ignore);
        continue;
      }
      last = yield* fireHook(hook, ctx);
      if (!last.allow && stopOnDeny) return last;
    }
    return last;
  });
}

export function toolMatchesPattern(toolName: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern).test(toolName);
  } catch {
    return false;
  }
}

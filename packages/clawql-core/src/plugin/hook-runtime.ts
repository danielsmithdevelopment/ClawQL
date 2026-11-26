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
  // Admin / unrestricted sessions use `*` — treat as wildcard, not a literal token.
  if (atrScope.has("*")) return true;
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

/**
 * Compile a lifecycle `toolPattern` for **full tool-name** matching.
 *
 * Patterns are always anchored as `^(?:…)$` so they match the entire tool name
 * (not a substring). Authors may still write `^…$` themselves; the outer wrap is
 * idempotent for typical patterns. Invalid regex syntax fails — callers must
 * reject registration / stop startup rather than silently skipping the hook.
 */
export function compileToolPattern(pattern: string): Effect.Effect<RegExp, ClawQLError> {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return Effect.fail(new ClawQLError({ reason: "toolPattern must be a non-empty regex" }));
  }
  return Effect.try({
    try: () => new RegExp(`^(?:${trimmed})$`),
    catch: (cause) =>
      new ClawQLError({
        reason: `Invalid toolPattern regex ${JSON.stringify(trimmed)}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause,
      }),
  });
}

/**
 * Match a tool name against a pattern compiled via {@link compileToolPattern},
 * or against a raw pattern string (compiled on the fly with the same anchoring).
 *
 * Prefer compiling at registration and passing the `RegExp`. Invalid string
 * patterns throw (via `Effect.runSync`) — they must not silently return false.
 */
export function toolMatchesPattern(
  toolName: string,
  pattern: string | RegExp | undefined
): boolean {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(toolName);
  const re = Effect.runSync(compileToolPattern(pattern));
  return re.test(toolName);
}

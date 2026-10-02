/**
 * Three-bucket execute() reachability (Unified Capability Lifecycle v0.2 §3.5).
 *
 * ALLOW iff:
 *   tool ∈ session_catalog ∩ S                          (bucket 1)
 *   OR (tool === skillId with PROMOTION_ACCEPTED ∧ validatedScope ⊆ S) (bucket 3)
 *
 * Bucket 2 (sandbox) grants permission to *run* contained code; it is NOT a
 * third execute() identity. Nested execute() from sandboxed code still hits
 * bucket 1 or 3 only.
 *
 * Disposition on deny is decided by clawql-core policy — never by harness claim:
 *   invoke  → denied
 *   register → routed_to_sandbox (exploration path) by default
 */

import { Effect } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { PromotionStore, validatedScopeSubsetOfS } from "./promotion-store.js";
import { SessionCatalogService } from "./session-catalog.js";
import type {
  CapabilityInterceptDisposition,
  CapabilityInterceptKind,
  ExecuteReachabilityDecision,
} from "./types.js";

export type EvaluateExecuteInput = {
  readonly sessionId: string;
  readonly toolName: string;
  /** invoke (default) or register — register side still needs §3.5.1 harness adapter. */
  readonly interceptKind?: CapabilityInterceptKind;
};

/** ClawQL-owned disposition — harness cannot override. */
export function dispositionForIntercept(
  kind: CapabilityInterceptKind
): CapabilityInterceptDisposition {
  return kind === "register" ? "routed_to_sandbox" : "denied";
}

/**
 * Pure evaluators for tests — Effect API wraps these with catalog/promotion stores.
 */
export function decideExecuteReachability(args: {
  readonly toolName: string;
  readonly sessionId: string;
  readonly catalogTools: ReadonlySet<string>;
  readonly atrScope: ReadonlySet<string>;
  /** Promoted skill whose skillId equals toolName (bucket 3). */
  readonly promoted?: { readonly skillId: string; readonly validatedScope: readonly string[] };
  readonly interceptKind?: CapabilityInterceptKind;
}): ExecuteReachabilityDecision {
  const interceptKind = args.interceptKind ?? "invoke";
  const disposition = dispositionForIntercept(interceptKind);

  // Bucket 1: membership in S inherited from session catalog — never from tool's claims
  if (args.catalogTools.has(args.toolName) && args.atrScope.has(args.toolName)) {
    return {
      allow: true,
      bucket: "session_catalog",
      toolName: args.toolName,
      sessionId: args.sessionId,
    };
  }

  // Bucket 3: only the promoted skillId itself is execute-reachable.
  // validatedScope tokens are permissions the skill may use via nested execute()
  // (those nested calls must still pass bucket 1 or another bucket-3 skillId) —
  // they are NOT a backdoor to invoke arbitrary tools outside the catalog.
  if (
    args.promoted &&
    args.promoted.skillId === args.toolName &&
    validatedScopeSubsetOfS(args.promoted.validatedScope, args.atrScope)
  ) {
    return {
      allow: true,
      bucket: "gated_skill",
      toolName: args.toolName,
      sessionId: args.sessionId,
    };
  }

  return {
    allow: false,
    toolName: args.toolName,
    sessionId: args.sessionId,
    interceptKind,
    disposition,
    reason:
      "tool outside three-bucket catalog (not in session_catalog∩S and no PROMOTION_ACCEPTED skillId with scope ⊆ S)",
  };
}

export function evaluateExecuteReachability(
  input: EvaluateExecuteInput
): Effect.Effect<
  ExecuteReachabilityDecision,
  never,
  SessionCatalogService | PromotionStore | WormAuditSink
> {
  return Effect.gen(function* () {
    const catalogs = yield* SessionCatalogService;
    const promotions = yield* PromotionStore;
    const worm = yield* WormAuditSink;

    const catalog = yield* catalogs.get(input.sessionId);
    if (!catalog) {
      const deny = decideExecuteReachability({
        toolName: input.toolName,
        sessionId: input.sessionId,
        catalogTools: new Set(),
        atrScope: new Set(),
        interceptKind: input.interceptKind,
      });
      if (!deny.allow) {
        yield* appendCapabilityWriteIntercepted(worm, deny);
      }
      return deny;
    }

    const promoted = yield* promotions.get(input.toolName);

    const decision = decideExecuteReachability({
      toolName: input.toolName,
      sessionId: input.sessionId,
      catalogTools: catalog.tools,
      atrScope: catalog.atrScope,
      promoted: promoted
        ? { skillId: promoted.skillId, validatedScope: promoted.validatedScope }
        : undefined,
      interceptKind: input.interceptKind,
    });

    if (!decision.allow) {
      yield* appendCapabilityWriteIntercepted(worm, decision);
    }

    return decision;
  });
}

function appendCapabilityWriteIntercepted(
  worm: { readonly append: (e: WormAuditEvent) => Effect.Effect<void> },
  deny: Extract<ExecuteReachabilityDecision, { allow: false }>
): Effect.Effect<void> {
  return worm.append({
    type: "CAPABILITY_WRITE_INTERCEPTED",
    sessionId: deny.sessionId,
    toolName: deny.toolName,
    interceptKind: deny.interceptKind,
    disposition: deny.disposition,
    reason: deny.reason,
    timestamp: new Date().toISOString(),
  } as WormAuditEvent);
}

export function recordSlowPathCompletedNoNewCapability(
  sessionId: string,
  meta?: Record<string, unknown>
): Effect.Effect<void, never, WormAuditSink> {
  return Effect.gen(function* () {
    const worm = yield* WormAuditSink;
    yield* worm.append({
      type: "SLOW_PATH_COMPLETED_NO_NEW_CAPABILITY",
      sessionId,
      timestamp: new Date().toISOString(),
      metadata: meta,
    } as WormAuditEvent);
  });
}

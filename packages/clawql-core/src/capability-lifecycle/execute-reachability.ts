/**
 * Three-bucket execute() reachability (Unified Capability Lifecycle v0.2 §3.5).
 *
 * ALLOW iff:
 *   tool ∈ session_catalog ∩ S                          (bucket 1)
 *   OR tool has PROMOTION_ACCEPTED AND validatedScope ⊆ S (bucket 3)
 *
 * Bucket 2 (sandbox) grants permission to *run* contained code; it is NOT a
 * third execute() identity. Nested execute() from sandboxed code still hits
 * bucket 1 or 3 only.
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
  /**
   * When a register attempt is legitimately routed to clawql-sandbox by clawql-core
   * (not by the harness's own claim), set disposition routed_to_sandbox.
   */
  readonly dispositionIfDenied?: CapabilityInterceptDisposition;
};

/**
 * Pure evaluators for tests — Effect API wraps these with catalog/promotion stores.
 */
export function decideExecuteReachability(args: {
  readonly toolName: string;
  readonly sessionId: string;
  readonly catalogTools: ReadonlySet<string>;
  readonly atrScope: ReadonlySet<string>;
  readonly promoted?: { readonly skillId: string; readonly validatedScope: readonly string[] };
  readonly interceptKind?: CapabilityInterceptKind;
  readonly dispositionIfDenied?: CapabilityInterceptDisposition;
}): ExecuteReachabilityDecision {
  const interceptKind = args.interceptKind ?? "invoke";
  const disposition = args.dispositionIfDenied ?? "denied";

  // Bucket 1: membership in S inherited from session catalog — never from tool's claims
  if (args.catalogTools.has(args.toolName) && args.atrScope.has(args.toolName)) {
    return {
      allow: true,
      bucket: "session_catalog",
      toolName: args.toolName,
      sessionId: args.sessionId,
    };
  }

  // Bucket 3: PROMOTION_ACCEPTED with validatedScope ⊆ S
  // Tool name may equal skillId or be listed in validatedScope
  if (args.promoted) {
    const inScope =
      args.promoted.skillId === args.toolName ||
      args.promoted.validatedScope.includes(args.toolName);
    if (
      inScope &&
      validatedScopeSubsetOfS(args.promoted.validatedScope, args.atrScope)
    ) {
      return {
        allow: true,
        bucket: "gated_skill",
        toolName: args.toolName,
        sessionId: args.sessionId,
      };
    }
  }

  return {
    allow: false,
    toolName: args.toolName,
    sessionId: args.sessionId,
    interceptKind,
    disposition,
    reason:
      "tool outside three-bucket catalog (not in session_catalog∩S and no PROMOTION_ACCEPTED with scope ⊆ S)",
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
        dispositionIfDenied: input.dispositionIfDenied,
      });
      // Still audit
      if (!deny.allow) {
        yield* appendCapabilityWriteIntercepted(worm, deny);
      }
      return deny;
    }

    const promoted =
      (yield* promotions.get(input.toolName)) ??
      (yield* findPromotionCoveringTool(() => promotions.list(), input.toolName));

    const decision = decideExecuteReachability({
      toolName: input.toolName,
      sessionId: input.sessionId,
      catalogTools: catalog.tools,
      atrScope: catalog.atrScope,
      promoted: promoted
        ? { skillId: promoted.skillId, validatedScope: promoted.validatedScope }
        : undefined,
      interceptKind: input.interceptKind,
      dispositionIfDenied: input.dispositionIfDenied,
    });

    if (!decision.allow) {
      yield* appendCapabilityWriteIntercepted(worm, decision);
    }

    return decision;
  });
}

function findPromotionCoveringTool(
  list: () => Effect.Effect<readonly import("./types.js").PromotedSkillRecord[]>,
  toolName: string
): Effect.Effect<import("./types.js").PromotedSkillRecord | undefined> {
  return Effect.gen(function* () {
    const all = yield* list();
    return all.find(
      (p) => p.skillId === toolName || p.validatedScope.includes(toolName)
    );
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

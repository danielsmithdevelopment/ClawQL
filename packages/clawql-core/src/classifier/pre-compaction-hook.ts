/**
 * Blocking pre-compaction lifecycle hook factory (§6.7).
 * Registers against LifecycleEvent `pre-compaction` (model scope).
 *
 * The factory accepts a Layer that provides classifier services so the
 * LifecycleHook handler R stays WormAuditSink-compatible (HookRuntimeServices).
 */

import { Effect, type Layer } from "effect";
import type {
  LifecycleHook,
  HookContext,
  HookResult,
  WormAuditSink,
} from "../plugin/provider-types.js";
import type { FastDecisionRegistry } from "./registry.js";
import type { FastDecisionScorer } from "./scorer.js";
import type { FastDecisionThresholdPolicyService } from "./threshold-policy.js";
import type { StableCacheBlockService } from "./stable-cache-block.js";
import {
  runPreCompactionOntologyCacheCheck,
  type HistoryEntryCandidate,
} from "./pre-compaction.js";

export type PreCompactionClassifierServices =
  | FastDecisionRegistry
  | FastDecisionScorer
  | FastDecisionThresholdPolicyService
  | StableCacheBlockService;

export type PreCompactionHookOptions = {
  readonly hookId?: string;
  /** Extract history candidates from HookContext.payload when not embedded. */
  readonly resolveEntries?: (ctx: HookContext) => readonly HistoryEntryCandidate[];
  /**
   * Layer providing classifier services (registry, scorer, policy, stable cache).
   * Must not include WormAuditSink — that remains in HookRuntimeServices.
   */
  readonly classifierLayer: Layer.Layer<PreCompactionClassifierServices, never, never>;
};

/**
 * Enforcement hook: must be awaited before compaction proceeds.
 * Payload should include `{ sessionId, agentId?, entries: HistoryEntryCandidate[] }`
 * or use `resolveEntries`.
 */
export function createPreCompactionOntologyCacheHook(
  options: PreCompactionHookOptions
): LifecycleHook {
  const resolveEntries = options.resolveEntries ?? (() => []);
  return {
    id: options.hookId ?? "pre-compaction-ontology-cache-check",
    scope: "model",
    event: "pre-compaction",
    blocking: true,
    handler: (ctx: HookContext): Effect.Effect<HookResult, Error, WormAuditSink> =>
      Effect.gen(function* () {
        const payload = (ctx.payload ?? {}) as {
          readonly sessionId?: string;
          readonly agentId?: string;
          readonly entries?: readonly HistoryEntryCandidate[];
        };
        const sessionId = payload.sessionId ?? ctx.session.id;
        const fromResolver = resolveEntries(ctx);
        const entries = fromResolver.length > 0 ? fromResolver : (payload.entries ?? []);

        const result = yield* runPreCompactionOntologyCacheCheck(
          { sessionId, agentId: payload.agentId },
          entries
        ).pipe(Effect.provide(options.classifierLayer));

        return {
          allow: true,
          meta: {
            preCompaction: result,
            compactionPermitted: true,
          },
        } satisfies HookResult;
      }),
  };
}

/**
 * Lifecycle orchestration — fast-path first, then slow path (§2–§3).
 *
 * Classification fork is NOT a harness decision. This helper only runs
 * skill_fast_path_match and records SLOW_PATH_COMPLETED_NO_NEW_CAPABILITY when
 * exploration uses existing tools. Sandbox routing is decided only at the
 * write/execute boundary via CapabilityRegisterIntercept / evaluateExecuteReachability
 * (register → routed_to_sandbox by clawql-core policy).
 */

import { Effect, Layer } from "effect";
import { decideSkillFastPath } from "../classifier/skill-fast-path.js";
import type { FastDecisionContext, SkillFastPathDecision } from "../classifier/types.js";
import { InMemoryWormAuditSinkLive } from "../plugin/worm-sink.js";
import {
  evaluateExecuteReachability,
  recordSlowPathCompletedNoNewCapability,
} from "./execute-reachability.js";
import {
  InMemoryPromotionStoreLive,
  makeInMemoryPromotionStore,
  PromotionStore,
} from "./promotion-store.js";
import {
  CapabilityRegisterIntercept,
  CapabilityRegisterInterceptLive,
  makeCapabilityRegisterIntercept,
} from "./register-intercept.js";
import {
  InMemorySessionCatalogLive,
  makeInMemorySessionCatalogService,
  SessionCatalogService,
} from "./session-catalog.js";
import type { ExecuteReachabilityDecision } from "./types.js";

export type CapabilityLifecycleOutcome =
  | {
      readonly path: "fast";
      readonly skill: Extract<SkillFastPathDecision, { path: "fast" }>;
    }
  | {
      readonly path: "slow";
      readonly skill: Extract<SkillFastPathDecision, { path: "slow" }>;
    };

/**
 * Run skill_fast_path_match first. Slow path without a subsequent register
 * intercept is recorded as SLOW_PATH_COMPLETED_NO_NEW_CAPABILITY.
 * Does not accept harness "novel capability" self-reports.
 */
export function runCapabilityLifecycleTurn(
  ctx: FastDecisionContext
): Effect.Effect<
  CapabilityLifecycleOutcome,
  never,
  | import("../classifier/registry.js").FastDecisionRegistry
  | import("../classifier/scorer.js").FastDecisionScorer
  | import("../classifier/threshold-policy.js").FastDecisionThresholdPolicyService
  | import("../classifier/skill-fast-path.js").SkillValidityStore
  | import("../plugin/provider-types.js").WormAuditSink
> {
  return Effect.gen(function* () {
    const skill = yield* decideSkillFastPath(ctx);
    if (skill.path === "fast") {
      return { path: "fast" as const, skill };
    }
    yield* recordSlowPathCompletedNoNewCapability(ctx.sessionId, {
      skillReason: skill.reason,
    });
    return {
      path: "slow" as const,
      skill,
    };
  });
}

/** Catalog + promotion + register-intercept (provide WormAuditSink at host/test). */
export const CapabilityLifecycleCatalogStackLive = Layer.mergeAll(
  InMemorySessionCatalogLive,
  InMemoryPromotionStoreLive,
  CapabilityRegisterInterceptLive
);

/**
 * Process-stable Layer: one shared Map for session catalogs / promotions.
 * Use this from MCP plugins so bind + pre-execute share state across Effect.runPromise.
 */
export function createSharedCapabilityCatalogLayer(): Layer.Layer<
  SessionCatalogService | PromotionStore | CapabilityRegisterIntercept
> {
  return Layer.mergeAll(
    Layer.succeed(SessionCatalogService, makeInMemorySessionCatalogService()),
    Layer.succeed(PromotionStore, makeInMemoryPromotionStore()),
    Layer.succeed(CapabilityRegisterIntercept, makeCapabilityRegisterIntercept())
  );
}

/** @deprecated Prefer CapabilityLifecycleCatalogStackLive + explicit WormAuditSink. */
export const CapabilityLifecycleTestStackLive = Layer.mergeAll(
  CapabilityLifecycleCatalogStackLive,
  InMemoryWormAuditSinkLive
);

export { evaluateExecuteReachability, recordSlowPathCompletedNoNewCapability };
export type { ExecuteReachabilityDecision };

/**
 * Lifecycle orchestration — fast-path first, then slow path (§2–§3).
 * Classification fork is NOT a harness decision — execute reachability is.
 */

import { Effect, Layer } from "effect";
import { decideSkillFastPath } from "../classifier/skill-fast-path.js";
import type { FastDecisionContext, SkillFastPathDecision } from "../classifier/types.js";
import { InMemoryWormAuditSinkLive } from "../plugin/worm-sink.js";
import {
  evaluateExecuteReachability,
  recordSlowPathCompletedNoNewCapability,
} from "./execute-reachability.js";
import { InMemoryPromotionStoreLive } from "./promotion-store.js";
import { CapabilityRegisterInterceptLive } from "./register-intercept.js";
import { InMemorySessionCatalogLive } from "./session-catalog.js";
import type { ExecuteReachabilityDecision } from "./types.js";

export type CapabilityLifecycleOutcome =
  | {
      readonly path: "fast";
      readonly skill: Extract<SkillFastPathDecision, { path: "fast" }>;
    }
  | {
      readonly path: "slow";
      readonly skill: Extract<SkillFastPathDecision, { path: "slow" }>;
      readonly newCapabilityRequired: boolean;
      /** When newCapabilityRequired, clawql-core routes to sandbox — harness does not decide. */
      readonly routeToSandbox: boolean;
    };

/**
 * Run skill_fast_path_match first. Slow path records whether novel capability
 * is required; routing to sandbox is a clawql-core decision flag, not harness trust.
 */
export function runCapabilityLifecycleTurn(
  ctx: FastDecisionContext,
  opts?: { readonly requiresNovelExecutableCapability?: boolean }
): Effect.Effect<
  CapabilityLifecycleOutcome,
  never,
  import("../classifier/registry.js").FastDecisionRegistry |
    import("../classifier/scorer.js").FastDecisionScorer |
    import("../classifier/threshold-policy.js").FastDecisionThresholdPolicyService |
    import("../classifier/skill-fast-path.js").SkillValidityStore |
    import("../plugin/provider-types.js").WormAuditSink
> {
  return Effect.gen(function* () {
    const skill = yield* decideSkillFastPath(ctx);
    if (skill.path === "fast") {
      return { path: "fast" as const, skill };
    }
    const newCapabilityRequired = opts?.requiresNovelExecutableCapability === true;
    if (!newCapabilityRequired) {
      yield* recordSlowPathCompletedNoNewCapability(ctx.sessionId, {
        skillReason: skill.reason,
      });
    }
    return {
      path: "slow" as const,
      skill,
      newCapabilityRequired,
      // clawql-core decides sandbox routing — never trust harness self-report
      routeToSandbox: newCapabilityRequired,
    };
  });
}

/** Catalog + promotion + register-intercept (provide WormAuditSink at host/test). */
export const CapabilityLifecycleCatalogStackLive = Layer.mergeAll(
  InMemorySessionCatalogLive,
  InMemoryPromotionStoreLive,
  CapabilityRegisterInterceptLive
);

/** @deprecated Prefer CapabilityLifecycleCatalogStackLive + explicit WormAuditSink. */
export const CapabilityLifecycleTestStackLive = Layer.mergeAll(
  CapabilityLifecycleCatalogStackLive,
  InMemoryWormAuditSinkLive
);

export { evaluateExecuteReachability, recordSlowPathCompletedNoNewCapability };
export type { ExecuteReachabilityDecision };

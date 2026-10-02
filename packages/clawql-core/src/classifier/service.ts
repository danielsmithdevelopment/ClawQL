/**
 * Fast Decision Primitive — composed Effect services + default Layers (§11).
 */

import { Effect, Layer } from "effect";
import { InMemoryWormAuditSinkLive } from "../plugin/worm-sink.js";
import { GlinerScorerConfigLive } from "./gliner-config.js";
import {
  FastDecisionRegistry,
  InMemoryFastDecisionRegistryLive,
  registerUseSites,
} from "./registry.js";
import {
  GlinerFastDecisionScorerLive,
  HeuristicFastDecisionScorerLive,
  NeedleFastDecisionScorerLive,
} from "./scorer.js";
import { InMemorySkillValidityStoreLive } from "./skill-fast-path.js";
import { InMemoryStableCacheBlockLive } from "./stable-cache-block.js";
import { InMemoryFastDecisionThresholdPolicyLive } from "./threshold-policy.js";
import { BUILTIN_FAST_DECISION_USE_SITES } from "./use-sites/builtins.js";
import { FastDecisionValidationLive } from "./validation.js";

/** Register all §3.3 built-in use sites into an existing registry. */
export function seedBuiltinUseSites(): Effect.Effect<void, never, FastDecisionRegistry> {
  return registerUseSites(BUILTIN_FAST_DECISION_USE_SITES);
}

/**
 * Test/dev stack: heuristic scorer + in-memory stores.
 * After provide, call `seedBuiltinUseSites()` once at boot.
 */
export const FastDecisionTestStackLive = Layer.mergeAll(
  InMemoryFastDecisionRegistryLive,
  HeuristicFastDecisionScorerLive,
  InMemoryFastDecisionThresholdPolicyLive,
  InMemorySkillValidityStoreLive,
  InMemoryStableCacheBlockLive,
  FastDecisionValidationLive,
  InMemoryWormAuditSinkLive
);

/**
 * Production-oriented stack: **GLiNER2** primary scorer (stub until
 * `CLAWQL_FAST_DECISION_GLINER_URL` is set) + in-memory policy/registry
 * (swap stores at host boundary).
 */
export const FastDecisionGlinerStackLive = Layer.mergeAll(
  GlinerScorerConfigLive,
  InMemoryFastDecisionRegistryLive,
  GlinerFastDecisionScorerLive,
  InMemoryFastDecisionThresholdPolicyLive,
  InMemorySkillValidityStoreLive,
  InMemoryStableCacheBlockLive,
  FastDecisionValidationLive,
  InMemoryWormAuditSinkLive
);

/** @deprecated Prefer {@link FastDecisionGlinerStackLive} — GLiNER2 is the primary backend. */
export const FastDecisionNeedleStackLive = Layer.mergeAll(
  InMemoryFastDecisionRegistryLive,
  NeedleFastDecisionScorerLive,
  InMemoryFastDecisionThresholdPolicyLive,
  InMemorySkillValidityStoreLive,
  InMemoryStableCacheBlockLive,
  FastDecisionValidationLive,
  InMemoryWormAuditSinkLive
);

/** Alias — default production stack is GLiNER2. */
export const FastDecisionDefaultStackLive = FastDecisionGlinerStackLive;

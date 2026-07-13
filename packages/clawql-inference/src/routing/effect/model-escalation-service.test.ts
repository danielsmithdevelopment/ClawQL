import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ModelEscalationConfig } from "../config.js";
import type { RoutingFailureSignal } from "../types.js";
import {
  AGENT_COORDINATION_DRIFT_TRIPWIRE,
  ModelEscalationService,
  modelEscalationLiveLayer,
} from "./model-escalation-service.js";

const tierMap = {
  frugal: "ollama/phi4",
  standard: "groq/llama",
  frontier: "anthropic/claude",
};

function config(overrides: Partial<ModelEscalationConfig> = {}): ModelEscalationConfig {
  return {
    enabled: true,
    tierMap,
    ...overrides,
  };
}

const failure: RoutingFailureSignal = {
  kind: "eval_below_min",
  detail: { score: 0.2 },
  generation: 2,
};

describe("ModelEscalationService", () => {
  it("starts decomposed children at frugal", async () => {
    const layer = modelEscalationLiveLayer(config());
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const escalation = yield* ModelEscalationService;
        return yield* escalation.initialTier({ isDecomposedChild: true, seedId: "child-1" });
      }).pipe(Effect.provide(layer))
    );
    expect(decision.tier).toBe("frugal");
    expect(decision.modelId).toBe("ollama/phi4");
    expect(decision.retryAttempt).toBe(0);
  });

  it("escalates one notch frugal → standard → frontier", async () => {
    const layer = modelEscalationLiveLayer(config());
    const run = async () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const escalation = yield* ModelEscalationService;
          const d0 = yield* escalation.initialTier({ isDecomposedChild: true, seedId: "s" });
          const d1 = yield* escalation.escalate(d0, failure);
          const d2 = yield* escalation.escalate(d1, failure);
          const d3 = yield* escalation.escalate(d2, failure);
          return { d0, d1, d2, d3 };
        }).pipe(Effect.provide(layer))
      );

    const { d1, d2, d3 } = await run();
    expect(d1.tier).toBe("standard");
    expect(d1.escalatedFrom).toBe("frugal");
    expect(d2.tier).toBe("frontier");
    expect(d3.tier).toBe("frontier");
    expect(d3.retryAttempt).toBe(3);
  });

  it("triggers agent coordination on drift tripwire", async () => {
    const layer = modelEscalationLiveLayer(config());
    const triggered = await Effect.runPromise(
      Effect.gen(function* () {
        const escalation = yield* ModelEscalationService;
        const decision = yield* escalation.initialTier({ isDecomposedChild: true, seedId: "s" });
        return yield* escalation.shouldTriggerAgentCoordination(decision, [failure], {
          combined: 0.5,
        });
      }).pipe(Effect.provide(layer))
    );
    expect(triggered).toBe(true);
    expect(AGENT_COORDINATION_DRIFT_TRIPWIRE).toBe(0.3);
  });

  it("honors model pin over tier ladder", async () => {
    const layer = modelEscalationLiveLayer(config({ modelPin: "openai/gpt-4o" }));
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const escalation = yield* ModelEscalationService;
        return yield* escalation.initialTier({ isDecomposedChild: false, seedId: "root" });
      }).pipe(Effect.provide(layer))
    );
    expect(decision.modelId).toBe("openai/gpt-4o");
    expect(decision.tier).toBe("standard");
  });
});

import { describe, expect, it } from "vitest";
import { TierEscalationRouter } from "./tier-escalation-router.js";
import type { RoutingFailureSignal } from "./types.js";
import type { ModelEscalationConfig } from "./config.js";

const tierMap = {
  frugal: "ollama/phi4",
  standard: "groq/llama",
  frontier: "anthropic/claude",
};

function router(overrides: Partial<ModelEscalationConfig> = {}): TierEscalationRouter {
  return new TierEscalationRouter({
    enabled: true,
    tierMap,
    ...overrides,
  });
}

const failure: RoutingFailureSignal = {
  kind: "eval_below_min",
  detail: { score: 0.2 },
  generation: 2,
};

describe("TierEscalationRouter.initialTier", () => {
  it("starts decomposed children at frugal", () => {
    const decision = router().initialTier({ isDecomposedChild: true, seedId: "child-1" });
    expect(decision.tier).toBe("frugal");
    expect(decision.modelId).toBe("ollama/phi4");
    expect(decision.retryAttempt).toBe(0);
  });

  it("starts top-level tasks at standard", () => {
    const decision = router().initialTier({ isDecomposedChild: false, seedId: "root" });
    expect(decision.tier).toBe("standard");
    expect(decision.modelId).toBe("groq/llama");
  });

  it("honors model pin over tier ladder", () => {
    const decision = router({ modelPin: "openai/gpt-4o" }).initialTier({
      isDecomposedChild: false,
      seedId: "root",
    });
    expect(decision.modelId).toBe("openai/gpt-4o");
    expect(decision.tier).toBe("standard");
  });
});

describe("TierEscalationRouter.escalate", () => {
  it("escalates one notch frugal → standard → frontier", () => {
    const r = router();
    const d0 = r.initialTier({ isDecomposedChild: true, seedId: "s" });
    const d1 = r.escalate(d0, failure);
    expect(d1.tier).toBe("standard");
    expect(d1.escalatedFrom).toBe("frugal");
    expect(d1.retryAttempt).toBe(1);

    const d2 = r.escalate(d1, failure);
    expect(d2.tier).toBe("frontier");
    expect(d2.escalatedFrom).toBe("standard");

    const d3 = r.escalate(d2, failure);
    expect(d3.tier).toBe("frontier");
    expect(d3.retryAttempt).toBe(3);
  });

  it("does not skip tiers when escalating from standard", () => {
    const r = router();
    const d0 = r.initialTier({ isDecomposedChild: false, seedId: "s" });
    const d1 = r.escalate(d0, failure);
    expect(d1.tier).toBe("frontier");
    expect(d1.escalatedFrom).toBe("standard");
  });
});

describe("TierEscalationRouter.shouldTriggerAgentCoordination", () => {
  it("returns false until agent coordination coupling ships (#562)", () => {
    const r = router();
    const d = r.initialTier({ isDecomposedChild: false, seedId: "s" });
    expect(r.shouldTriggerAgentCoordination(d, [failure], { combined: 0.5 })).toBe(false);
  });
});

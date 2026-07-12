import { describe, expect, it } from "vitest";
import { evaluateAgentCoordination } from "./trigger.js";
import { TierEscalationRouter } from "../routing/tier-escalation-router.js";

describe("evaluateAgentCoordination", () => {
  it("triggers on standard-tier failure with drift", async () => {
    const router = new TierEscalationRouter({
      enabled: true,
      tierMap: {
        frugal: "ollama/phi4",
        standard: "groq/llama",
        frontier: "anthropic/claude",
      },
    });
    const result = await evaluateAgentCoordination({
      router,
      decision: { tier: "standard", modelId: "groq/llama", retryAttempt: 1 },
      signals: [{ kind: "eval_below_min", detail: { score: 0.1 }, generation: 1 }],
      driftCombined: 0.4,
      env: { CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED: "1" },
    });
    expect(result.triggered).toBe(true);
    expect(result.auditEntry?.action).toBe("agent_coordination");
  });
});

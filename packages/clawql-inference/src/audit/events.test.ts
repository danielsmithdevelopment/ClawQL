import { describe, expect, it } from "vitest";
import { buildModelEscalationAuditEntry, buildAgentCoordinationAuditEntry } from "./events.js";

describe("inference audit events", () => {
  it("builds model_escalation audit entry", () => {
    const entry = buildModelEscalationAuditEntry({
      before: { tier: "frugal", modelId: "ollama/phi4", retryAttempt: 0 },
      after: {
        tier: "standard",
        modelId: "groq/llama",
        retryAttempt: 1,
        escalatedFrom: "frugal",
        trigger: { kind: "eval_below_min", detail: { score: 0.2 }, generation: 1 },
      },
      correlationId: "seed_abc_gen_2",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(entry.action).toBe("model_escalation");
    expect(entry.payload.event).toBe("model_escalation");
    expect(entry.correlationId).toBe("seed_abc_gen_2");
  });

  it("builds agent_coordination audit entry", () => {
    const entry = buildAgentCoordinationAuditEntry({
      decision: { tier: "standard", modelId: "groq/llama", retryAttempt: 1 },
      signals: [{ kind: "drift_exceeded", detail: { combined: 0.5 }, generation: 2 }],
      driftCombined: 0.5,
      correlationId: "seed_abc_gen_2",
    });
    expect(entry.action).toBe("agent_coordination");
    expect(entry.payload.event).toBe("agent_coordination");
  });
});
